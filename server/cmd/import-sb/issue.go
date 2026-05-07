package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
)

type EdgeRef struct {
	FromSlug string
	ToSlug   string
	Type     string
}

func insertIssue(ctx context.Context, pool *pgxpool.Pool, wsID pgtype.UUID, creatorID pgtype.UUID, parsed ParsedIssue, pendingDeps *[]EdgeRef) (pgtype.UUID, error) {
	meta := parsed.Meta

	var number int32
	err := pool.QueryRow(ctx,
		`UPDATE workspace SET issue_counter = issue_counter + 1 WHERE id = $1 RETURNING issue_counter`,
		wsID,
	).Scan(&number)
	if err != nil {
		return pgtype.UUID{}, fmt.Errorf("increment issue counter: %w", err)
	}

	status := remapStatus(meta.Status)
	if status == "" {
		status = "open"
	}
	priority := meta.Priority
	if priority == "" {
		priority = "medium"
	}

	contextRefs := buildContextRefs(meta)
	createdAt := parseCreated(meta.Created)

	description := pgtype.Text{String: parsed.Body, Valid: parsed.Body != ""}
	if meta.AutoAgentTask != "" {
		footer := fmt.Sprintf("\n\n_Previously executed in legacy auto-agent: %s_", meta.AutoAgentTask)
		description.String += footer
		description.Valid = true
	}

	var issueID pgtype.UUID
	err = pool.QueryRow(ctx,
		`INSERT INTO issue (
			workspace_id, title, description, status, priority,
			creator_type, creator_id, number, position,
			acceptance_criteria, context_refs, created_at, updated_at
		) VALUES (
			$1, $2, $3, $4, $5,
			'member', $6, $7, $7::float,
			'[]'::jsonb, $8, $9, $9
		) RETURNING id`,
		wsID, meta.Title, description, status, priority,
		creatorID, number, contextRefs, createdAt,
	).Scan(&issueID)
	if err != nil {
		return pgtype.UUID{}, fmt.Errorf("insert issue %q: %w", meta.Title, err)
	}

	if meta.Type != "" {
		if err := attachLabel(ctx, pool, wsID, issueID, meta.Type); err != nil {
			slog.Warn("attach label failed", "issue", meta.Title, "label", meta.Type, "error", err)
		}
	}

	for _, slug := range meta.DependsOn {
		*pendingDeps = append(*pendingDeps, EdgeRef{FromSlug: parsed.Slug, ToSlug: slug, Type: "blocked_by"})
	}
	for _, slug := range meta.Related {
		*pendingDeps = append(*pendingDeps, EdgeRef{FromSlug: parsed.Slug, ToSlug: slug, Type: "related"})
	}

	return issueID, nil
}

func buildContextRefs(meta IssueMeta) []byte {
	refs := map[string]any{}
	if meta.GithubIssue != "" {
		refs["github_issue"] = meta.GithubIssue
	}
	if len(refs) == 0 {
		return []byte("[]")
	}
	b, _ := json.Marshal(refs)
	return b
}

func attachLabel(ctx context.Context, pool *pgxpool.Pool, wsID, issueID pgtype.UUID, labelName string) error {
	var labelID pgtype.UUID
	err := pool.QueryRow(ctx,
		`SELECT id FROM issue_label WHERE workspace_id = $1 AND name = $2`,
		wsID, labelName,
	).Scan(&labelID)
	if err != nil {
		err = pool.QueryRow(ctx,
			`INSERT INTO issue_label (workspace_id, name, color) VALUES ($1, $2, $3) RETURNING id`,
			wsID, labelName, labelColor(labelName),
		).Scan(&labelID)
		if err != nil {
			return err
		}
	}

	_, err = pool.Exec(ctx,
		`INSERT INTO issue_to_label (issue_id, label_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
		issueID, labelID,
	)
	return err
}

func labelColor(name string) string {
	switch name {
	case "bug":
		return "#ef4444"
	case "feature":
		return "#22c55e"
	case "idea":
		return "#eab308"
	case "exploration":
		return "#3b82f6"
	default:
		return "#6b7280"
	}
}

func resolveIssueDep(ctx context.Context, pool *pgxpool.Pool, edge EdgeRef, slugToID map[string]pgtype.UUID) {
	fromID, ok1 := slugToID[edge.FromSlug]
	toID, ok2 := slugToID[edge.ToSlug]
	if !ok1 || !ok2 {
		slog.Warn("unresolved issue dependency, skipping",
			"from", edge.FromSlug, "to", edge.ToSlug, "type", edge.Type)
		return
	}
	_, err := pool.Exec(ctx,
		`INSERT INTO issue_dependency (issue_id, depends_on_issue_id, type) VALUES ($1, $2, $3)`,
		fromID, toID, edge.Type,
	)
	if err != nil {
		slog.Warn("insert issue dependency failed",
			"from", edge.FromSlug, "to", edge.ToSlug, "error", err)
	}
}
