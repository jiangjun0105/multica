package main

import (
	"context"
	"fmt"
	"os"
	"testing"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
)

var testPool *pgxpool.Pool

func TestMain(m *testing.M) {
	ctx := context.Background()
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		dbURL = "postgres://multica:multica@localhost:5432/multica?sslmode=disable"
	}

	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		fmt.Printf("Skipping DB tests: could not connect: %v\n", err)
		os.Exit(0)
	}
	if err := pool.Ping(ctx); err != nil {
		fmt.Printf("Skipping DB tests: database not reachable: %v\n", err)
		pool.Close()
		os.Exit(0)
	}

	// Verify the task table exists (migrations applied).
	var exists bool
	pool.QueryRow(ctx, `SELECT EXISTS (
		SELECT 1 FROM information_schema.tables WHERE table_name = 'task'
	)`).Scan(&exists)
	if !exists {
		fmt.Printf("Skipping DB tests: task table does not exist (run migrations first)\n")
		pool.Close()
		os.Exit(0)
	}

	testPool = pool
	code := m.Run()
	pool.Close()
	os.Exit(code)
}

const integrationTestSlug = "importer-integration-test"

func setupTestWorkspace(t *testing.T) (pgtype.UUID, pgtype.UUID) {
	t.Helper()
	ctx := context.Background()

	// Create user
	var userID pgtype.UUID
	err := testPool.QueryRow(ctx,
		`INSERT INTO "user" (name, email) VALUES ($1, $2) RETURNING id`,
		"Importer Test", "importer-test@test.local",
	).Scan(&userID)
	if err != nil {
		t.Fatalf("create test user: %v", err)
	}

	// Create workspace
	var wsID pgtype.UUID
	err = testPool.QueryRow(ctx,
		`INSERT INTO workspace (name, slug, issue_prefix, issue_counter) VALUES ($1, $2, $3, 0) RETURNING id`,
		"Importer Test WS", integrationTestSlug, "IMP",
	).Scan(&wsID)
	if err != nil {
		t.Fatalf("create test workspace: %v", err)
	}

	// Create member
	_, err = testPool.Exec(ctx,
		`INSERT INTO member (workspace_id, user_id, role) VALUES ($1, $2, 'owner')`,
		wsID, userID,
	)
	if err != nil {
		t.Fatalf("create test member: %v", err)
	}

	t.Cleanup(func() {
		ctx := context.Background()
		testPool.Exec(ctx, `DELETE FROM task_dependency WHERE task_id IN (SELECT id FROM task WHERE workspace_id = $1)`, wsID)
		testPool.Exec(ctx, `DELETE FROM issue_dependency WHERE issue_id IN (SELECT id FROM issue WHERE workspace_id = $1)`, wsID)
		testPool.Exec(ctx, `DELETE FROM issue_to_label WHERE issue_id IN (SELECT id FROM issue WHERE workspace_id = $1)`, wsID)
		testPool.Exec(ctx, `DELETE FROM task WHERE workspace_id = $1`, wsID)
		testPool.Exec(ctx, `DELETE FROM issue WHERE workspace_id = $1`, wsID)
		testPool.Exec(ctx, `DELETE FROM issue_label WHERE workspace_id = $1`, wsID)
		testPool.Exec(ctx, `DELETE FROM member WHERE workspace_id = $1`, wsID)
		testPool.Exec(ctx, `DELETE FROM workspace WHERE id = $1`, wsID)
		testPool.Exec(ctx, `DELETE FROM "user" WHERE id = $1`, userID)
	})

	return wsID, userID
}

func TestIntegration_InsertIssueAndTask(t *testing.T) {
	if testPool == nil {
		t.Skip("no database connection")
	}
	ctx := context.Background()
	wsID, creatorID := setupTestWorkspace(t)

	// Insert an issue
	issueParsed := ParsedIssue{
		ParsedFile: ParsedFile{Slug: "test-issue-1", Body: "Test body"},
		Meta: IssueMeta{
			Title:    "Integration test issue",
			Created:  "2026-01-01T10:00",
			Status:   "open",
			Priority: "high",
			Type:     "bug",
		},
	}
	var pendingIssueDeps []EdgeRef
	issueID, err := insertIssue(ctx, testPool, wsID, creatorID, issueParsed, &pendingIssueDeps)
	if err != nil {
		t.Fatalf("insertIssue: %v", err)
	}
	if !issueID.Valid {
		t.Fatal("insertIssue returned invalid UUID")
	}

	// Verify issue row
	var title, status string
	err = testPool.QueryRow(ctx,
		`SELECT title, status FROM issue WHERE id = $1`, issueID,
	).Scan(&title, &status)
	if err != nil {
		t.Fatalf("query issue: %v", err)
	}
	if title != "Integration test issue" {
		t.Errorf("issue title = %q, want %q", title, "Integration test issue")
	}
	if status != "open" {
		t.Errorf("issue status = %q, want %q", status, "open")
	}

	// Verify label was attached
	var labelCount int
	testPool.QueryRow(ctx,
		`SELECT count(*) FROM issue_to_label il
		 JOIN issue_label l ON l.id = il.label_id
		 WHERE il.issue_id = $1 AND l.name = 'bug'`, issueID,
	).Scan(&labelCount)
	if labelCount != 1 {
		t.Errorf("expected 1 'bug' label attached, got %d", labelCount)
	}

	// Insert a task
	taskParsed := ParsedTask{
		ParsedFile: ParsedFile{Slug: "test-task-1", Body: "Task body"},
		Meta: TaskMeta{
			Title:       "Integration test task",
			Created:     "2026-01-01T11:00",
			Status:      "in-progress",
			Priority:    "medium",
			Suitability: "auto_agent_ready",
			Branch:      "feat/test",
		},
	}
	var pendingTaskDeps []EdgeRef
	taskID, err := insertTask(ctx, testPool, wsID, creatorID, taskParsed, &pendingTaskDeps, map[string]pgtype.UUID{})
	if err != nil {
		t.Fatalf("insertTask: %v", err)
	}
	if !taskID.Valid {
		t.Fatal("insertTask returned invalid UUID")
	}

	// Verify task row (status remapped)
	var taskTitle, taskStatus string
	err = testPool.QueryRow(ctx,
		`SELECT title, status FROM task WHERE id = $1`, taskID,
	).Scan(&taskTitle, &taskStatus)
	if err != nil {
		t.Fatalf("query task: %v", err)
	}
	if taskTitle != "Integration test task" {
		t.Errorf("task title = %q, want %q", taskTitle, "Integration test task")
	}
	if taskStatus != "in_progress" {
		t.Errorf("task status = %q, want %q (should remap in-progress)", taskStatus, "in_progress")
	}
}

func TestIntegration_TwoPassDependencyResolution(t *testing.T) {
	if testPool == nil {
		t.Skip("no database connection")
	}
	ctx := context.Background()
	wsID, creatorID := setupTestWorkspace(t)

	// Insert two issues with a related dependency
	issue1 := ParsedIssue{
		ParsedFile: ParsedFile{Slug: "dep-issue-a", Body: "Issue A"},
		Meta: IssueMeta{
			Title:    "Dep test issue A",
			Created:  "2026-01-01T10:00",
			Status:   "open",
			Priority: "high",
			Related:  []string{"dep-issue-b"},
		},
	}
	issue2 := ParsedIssue{
		ParsedFile: ParsedFile{Slug: "dep-issue-b", Body: "Issue B"},
		Meta: IssueMeta{
			Title:    "Dep test issue B",
			Created:  "2026-01-01T10:00",
			Status:   "triaged",
			Priority: "medium",
		},
	}

	var pendingDeps []EdgeRef
	idA, err := insertIssue(ctx, testPool, wsID, creatorID, issue1, &pendingDeps)
	if err != nil {
		t.Fatalf("insert issue A: %v", err)
	}
	idB, err := insertIssue(ctx, testPool, wsID, creatorID, issue2, &pendingDeps)
	if err != nil {
		t.Fatalf("insert issue B: %v", err)
	}

	slugToID := map[string]pgtype.UUID{
		"dep-issue-a": idA,
		"dep-issue-b": idB,
	}

	// Resolve dependencies (pass 2)
	if len(pendingDeps) != 1 {
		t.Fatalf("expected 1 pending dep, got %d", len(pendingDeps))
	}
	resolveIssueDep(ctx, testPool, pendingDeps[0], slugToID)

	// Verify the dependency row exists
	var depCount int
	testPool.QueryRow(ctx,
		`SELECT count(*) FROM issue_dependency WHERE issue_id = $1 AND depends_on_issue_id = $2`,
		idA, idB,
	).Scan(&depCount)
	if depCount != 1 {
		t.Errorf("expected 1 issue_dependency row, got %d", depCount)
	}

	// Two tasks with blocked_by dependency
	task1 := ParsedTask{
		ParsedFile: ParsedFile{Slug: "dep-task-x", Body: "Task X"},
		Meta: TaskMeta{
			Title:     "Dep test task X",
			Created:   "2026-01-01T12:00",
			Status:    "open",
			Priority:  "high",
			DependsOn: []string{"dep-task-y"},
		},
	}
	task2 := ParsedTask{
		ParsedFile: ParsedFile{Slug: "dep-task-y", Body: "Task Y"},
		Meta: TaskMeta{
			Title:    "Dep test task Y",
			Created:  "2026-01-01T12:00",
			Status:   "open",
			Priority: "medium",
		},
	}

	var taskDeps []EdgeRef
	txID, _ := insertTask(ctx, testPool, wsID, creatorID, task1, &taskDeps, map[string]pgtype.UUID{})
	tyID, _ := insertTask(ctx, testPool, wsID, creatorID, task2, &taskDeps, map[string]pgtype.UUID{})

	taskSlugToID := map[string]pgtype.UUID{"dep-task-x": txID, "dep-task-y": tyID}
	for _, e := range taskDeps {
		resolveTaskDep(ctx, testPool, e, taskSlugToID)
	}

	var taskDepCount int
	testPool.QueryRow(ctx,
		`SELECT count(*) FROM task_dependency WHERE task_id = $1 AND depends_on_task_id = $2 AND type = 'blocked_by'`,
		txID, tyID,
	).Scan(&taskDepCount)
	if taskDepCount != 1 {
		t.Errorf("expected 1 task_dependency row, got %d", taskDepCount)
	}
}

func TestIntegration_PreflightRejectsExistingData(t *testing.T) {
	if testPool == nil {
		t.Skip("no database connection")
	}
	ctx := context.Background()
	wsID, creatorID := setupTestWorkspace(t)

	// Empty workspace should pass pre-flight
	count, err := countNonSeedRows(ctx, testPool, wsID)
	if err != nil {
		t.Fatalf("countNonSeedRows: %v", err)
	}
	if count != 0 {
		t.Errorf("fresh workspace should have 0 non-seed rows, got %d", count)
	}

	// Insert one issue
	parsed := ParsedIssue{
		ParsedFile: ParsedFile{Slug: "preflight-issue", Body: "Body"},
		Meta: IssueMeta{
			Title:    "Preflight test issue",
			Created:  "2026-01-01T10:00",
			Status:   "open",
			Priority: "medium",
		},
	}
	var deps []EdgeRef
	_, err = insertIssue(ctx, testPool, wsID, creatorID, parsed, &deps)
	if err != nil {
		t.Fatalf("insertIssue: %v", err)
	}

	// Now pre-flight should detect non-seed data
	count, err = countNonSeedRows(ctx, testPool, wsID)
	if err != nil {
		t.Fatalf("countNonSeedRows after insert: %v", err)
	}
	if count == 0 {
		t.Error("pre-flight should detect the inserted issue as non-seed data")
	}
}

func TestIntegration_UnresolvedRefSkipped(t *testing.T) {
	if testPool == nil {
		t.Skip("no database connection")
	}
	ctx := context.Background()
	wsID, creatorID := setupTestWorkspace(t)

	// Insert an issue that references a nonexistent slug
	parsed := ParsedIssue{
		ParsedFile: ParsedFile{Slug: "orphan-issue", Body: "Body"},
		Meta: IssueMeta{
			Title:    "Orphan ref test",
			Created:  "2026-01-01T10:00",
			Status:   "open",
			Priority: "low",
			Related:  []string{"nonexistent-slug"},
		},
	}
	var deps []EdgeRef
	id, err := insertIssue(ctx, testPool, wsID, creatorID, parsed, &deps)
	if err != nil {
		t.Fatalf("insertIssue: %v", err)
	}

	slugToID := map[string]pgtype.UUID{"orphan-issue": id}

	// Attempt to resolve — should warn and skip, not panic
	for _, e := range deps {
		resolveIssueDep(ctx, testPool, e, slugToID)
	}

	// Verify no dependency rows were created
	var depCount int
	testPool.QueryRow(ctx,
		`SELECT count(*) FROM issue_dependency WHERE issue_id = $1`, id,
	).Scan(&depCount)
	if depCount != 0 {
		t.Errorf("expected 0 deps for unresolved ref, got %d", depCount)
	}
}
