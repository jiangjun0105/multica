package main

import (
	"context"
	"flag"
	"fmt"
	"log/slog"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
)

func main() {
	workspace := flag.String("workspace", "", "Workspace slug to import into (required)")
	issuesDir := flag.String("issues-dir", "", "Path to .shared-issues/ directory (default: auto-detect via git)")
	tasksDir := flag.String("tasks-dir", "", "Path to .shared-tasks/ directory (default: auto-detect via git)")
	dryRun := flag.Bool("dry-run", false, "Print plan without writing to the database")
	force := flag.Bool("force", false, "Override pre-flight safety check")
	flag.Parse()

	if *workspace == "" {
		fmt.Fprintln(os.Stderr, "error: --workspace is required")
		os.Exit(1)
	}

	if *issuesDir == "" || *tasksDir == "" {
		root := detectRepoRoot()
		if *issuesDir == "" {
			*issuesDir = filepath.Join(root, ".shared-issues")
		}
		if *tasksDir == "" {
			*tasksDir = filepath.Join(root, ".shared-tasks")
		}
	}

	ctx := context.Background()
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		dbURL = "postgres://multica:multica@localhost:5432/multica?sslmode=disable"
	}

	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		slog.Error("unable to connect to database", "error", err)
		os.Exit(1)
	}
	defer pool.Close()

	if err := pool.Ping(ctx); err != nil {
		slog.Error("unable to ping database", "error", err)
		os.Exit(1)
	}

	ws, creatorID, err := resolveWorkspace(ctx, pool, *workspace)
	if err != nil {
		slog.Error("workspace resolution failed", "error", err)
		os.Exit(1)
	}

	issueFiles, _ := walkMarkdown(*issuesDir)
	taskFiles, _ := walkMarkdown(*tasksDir)

	if len(issueFiles) == 0 && len(taskFiles) == 0 {
		fmt.Println("No markdown files found in the specified directories.")
		fmt.Printf("  --issues-dir: %s\n", *issuesDir)
		fmt.Printf("  --tasks-dir:  %s\n", *tasksDir)
		os.Exit(0)
	}

	if *dryRun {
		printDryRun(issueFiles, taskFiles)
		return
	}

	if !*force {
		count, err := countNonSeedRows(ctx, pool, ws)
		if err != nil {
			slog.Error("pre-flight check failed", "error", err)
			os.Exit(1)
		}
		if count > 0 {
			fmt.Fprintf(os.Stderr, "error: workspace %q already has %d imported issues/tasks; "+
				"this is a one-shot migration tool. Reset the workspace or pass --force to override.\n",
				*workspace, count)
			os.Exit(1)
		}
	}

	ensureLabels(ctx, pool, ws)

	issueSlugToID := map[string]pgtype.UUID{}
	taskSlugToID := map[string]pgtype.UUID{}
	var pendingIssueDeps, pendingTaskDeps []EdgeRef
	var issueCount, taskCount, skippedIssues, skippedTasks int

	for _, f := range issueFiles {
		parsed, err := parseIssueFrontmatter(f)
		if err != nil {
			slog.Warn("parse issue failed, skipping", "file", f, "error", err)
			skippedIssues++
			continue
		}
		id, err := insertIssue(ctx, pool, ws, creatorID, parsed, &pendingIssueDeps)
		if err != nil {
			slog.Warn("insert issue failed, skipping", "file", f, "error", err)
			skippedIssues++
			continue
		}
		issueSlugToID[parsed.Slug] = id
		issueCount++
	}

	for _, f := range taskFiles {
		parsed, err := parseTaskFrontmatter(f)
		if err != nil {
			slog.Warn("parse task failed, skipping", "file", f, "error", err)
			skippedTasks++
			continue
		}
		id, err := insertTask(ctx, pool, ws, creatorID, parsed, &pendingTaskDeps, issueSlugToID)
		if err != nil {
			slog.Warn("insert task failed, skipping", "file", f, "error", err)
			skippedTasks++
			continue
		}
		taskSlugToID[parsed.Slug] = id
		taskCount++
	}

	var edgeCount, unresolved int
	for _, e := range pendingIssueDeps {
		_, ok1 := issueSlugToID[e.FromSlug]
		_, ok2 := issueSlugToID[e.ToSlug]
		if ok1 && ok2 {
			resolveIssueDep(ctx, pool, e, issueSlugToID)
			edgeCount++
		} else {
			unresolved++
			slog.Warn("unresolved issue ref", "from", e.FromSlug, "to", e.ToSlug)
		}
	}
	for _, e := range pendingTaskDeps {
		_, ok1 := taskSlugToID[e.FromSlug]
		_, ok2 := taskSlugToID[e.ToSlug]
		if ok1 && ok2 {
			resolveTaskDep(ctx, pool, e, taskSlugToID)
			edgeCount++
		} else {
			unresolved++
			slog.Warn("unresolved task ref", "from", e.FromSlug, "to", e.ToSlug)
		}
	}

	fmt.Printf("imported: %d issues, %d tasks, %d edges; skipped: %d unresolved refs, %d parse/insert errors\n",
		issueCount, taskCount, edgeCount, unresolved, skippedIssues+skippedTasks)
}

func resolveWorkspace(ctx context.Context, pool *pgxpool.Pool, slug string) (pgtype.UUID, pgtype.UUID, error) {
	var wsID pgtype.UUID
	err := pool.QueryRow(ctx, `SELECT id FROM workspace WHERE slug = $1`, slug).Scan(&wsID)
	if err != nil {
		return pgtype.UUID{}, pgtype.UUID{}, fmt.Errorf("workspace %q not found: %w", slug, err)
	}

	var creatorID pgtype.UUID
	err = pool.QueryRow(ctx,
		`SELECT m.user_id FROM member m WHERE m.workspace_id = $1 AND m.role = 'owner' LIMIT 1`,
		wsID,
	).Scan(&creatorID)
	if err != nil {
		err = pool.QueryRow(ctx,
			`SELECT m.user_id FROM member m WHERE m.workspace_id = $1 LIMIT 1`,
			wsID,
		).Scan(&creatorID)
		if err != nil {
			return pgtype.UUID{}, pgtype.UUID{}, fmt.Errorf("no members in workspace %q: %w", slug, err)
		}
	}

	return wsID, creatorID, nil
}

func countNonSeedRows(ctx context.Context, pool *pgxpool.Pool, wsID pgtype.UUID) (int, error) {
	var count int
	err := pool.QueryRow(ctx, `
		SELECT (
			SELECT count(*) FROM issue
			WHERE workspace_id = $1
			  AND title NOT LIKE '👋 Welcome to Multica%'
			  AND title !~ '^\d+\. '
		) + (
			SELECT count(*) FROM task WHERE workspace_id = $1
		)
	`, wsID).Scan(&count)
	return count, err
}

func ensureLabels(ctx context.Context, pool *pgxpool.Pool, wsID pgtype.UUID) {
	labels := []struct {
		name  string
		color string
	}{
		{"bug", "#ef4444"},
		{"feature", "#22c55e"},
		{"idea", "#eab308"},
		{"exploration", "#3b82f6"},
	}
	for _, l := range labels {
		pool.Exec(ctx,
			`INSERT INTO issue_label (workspace_id, name, color) VALUES ($1, $2, $3)
			 ON CONFLICT DO NOTHING`,
			wsID, l.name, l.color,
		)
	}
}

func printDryRun(issueFiles, taskFiles []string) {
	fmt.Printf("=== DRY RUN ===\n")
	fmt.Printf("Issues to import: %d\n", len(issueFiles))
	for _, f := range issueFiles {
		parsed, err := parseIssueFrontmatter(f)
		if err != nil {
			fmt.Printf("  [PARSE ERROR] %s: %v\n", filepath.Base(f), err)
			continue
		}
		fmt.Printf("  [create] %s → %q (status=%s, priority=%s, type=%s)\n",
			parsed.Slug, parsed.Meta.Title, parsed.Meta.Status, parsed.Meta.Priority, parsed.Meta.Type)
	}
	fmt.Printf("\nTasks to import: %d\n", len(taskFiles))
	for _, f := range taskFiles {
		parsed, err := parseTaskFrontmatter(f)
		if err != nil {
			fmt.Printf("  [PARSE ERROR] %s: %v\n", filepath.Base(f), err)
			continue
		}
		fmt.Printf("  [create] %s → %q (status=%s, priority=%s, suitability=%s)\n",
			parsed.Slug, parsed.Meta.Title, parsed.Meta.Status, parsed.Meta.Priority, parsed.Meta.Suitability)
	}
	fmt.Printf("\nNo database writes performed.\n")
}

func detectRepoRoot() string {
	cmd := exec.Command("git", "rev-parse", "--show-toplevel")
	out, err := cmd.Output()
	if err != nil {
		cwd, _ := os.Getwd()
		return cwd
	}
	return strings.TrimSpace(string(out))
}
