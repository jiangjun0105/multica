package main

import (
	"context"
	"fmt"
	"log/slog"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
)

func insertTask(ctx context.Context, pool *pgxpool.Pool, wsID pgtype.UUID, creatorID pgtype.UUID, parsed ParsedTask, pendingDeps *[]EdgeRef, issueSlugToID map[string]pgtype.UUID) (pgtype.UUID, error) {
	meta := parsed.Meta

	var number int32
	err := pool.QueryRow(ctx,
		`UPDATE workspace SET issue_counter = issue_counter + 1 WHERE id = $1 RETURNING issue_counter`,
		wsID,
	).Scan(&number)
	if err != nil {
		return pgtype.UUID{}, fmt.Errorf("increment task counter: %w", err)
	}

	status := remapStatus(meta.Status)
	if status == "" {
		status = "pending"
	}
	switch status {
	case "open":
		status = "pending"
	case "triaged":
		status = "pending"
	case "closed":
		status = "done"
	}

	priority := meta.Priority
	if priority == "" {
		priority = "medium"
	}

	description := parsed.Body
	if meta.AutoAgentTask != "" {
		description += fmt.Sprintf("\n\n_Previously executed in legacy auto-agent: %s_", meta.AutoAgentTask)
	}

	suitability := pgtype.Text{}
	if meta.Suitability != "" {
		suitability = pgtype.Text{String: meta.Suitability, Valid: true}
	}
	branch := pgtype.Text{}
	if meta.Branch != "" {
		branch = pgtype.Text{String: meta.Branch, Valid: true}
	}
	pr := pgtype.Text{}
	if meta.PR != "" {
		pr = pgtype.Text{String: meta.PR, Valid: true}
	}
	manualTest := pgtype.Text{}
	if meta.ManualTest != "" {
		manualTest = pgtype.Text{String: meta.ManualTest, Valid: true}
	}

	createdAt := parseCreated(meta.Created)

	var taskID pgtype.UUID
	err = pool.QueryRow(ctx,
		`INSERT INTO task (
			workspace_id, number, title, description,
			status, priority, suitability, branch, pr, manual_test,
			creator_type, creator_id,
			created_at, updated_at
		) VALUES (
			$1, $2, $3, $4,
			$5, $6, $7, $8, $9, $10,
			'member', $11,
			$12, $12
		) RETURNING id`,
		wsID, number, meta.Title, description,
		status, priority, suitability, branch, pr, manualTest,
		creatorID,
		createdAt,
	).Scan(&taskID)
	if err != nil {
		return pgtype.UUID{}, fmt.Errorf("insert task %q: %w", meta.Title, err)
	}

	for _, slug := range meta.DependsOn {
		*pendingDeps = append(*pendingDeps, EdgeRef{FromSlug: parsed.Slug, ToSlug: slug, Type: "blocked_by"})
	}
	for _, slug := range meta.Related {
		*pendingDeps = append(*pendingDeps, EdgeRef{FromSlug: parsed.Slug, ToSlug: slug, Type: "related"})
	}

	return taskID, nil
}

func resolveTaskDep(ctx context.Context, pool *pgxpool.Pool, edge EdgeRef, slugToID map[string]pgtype.UUID) {
	fromID, ok1 := slugToID[edge.FromSlug]
	toID, ok2 := slugToID[edge.ToSlug]
	if !ok1 || !ok2 {
		slog.Warn("unresolved task dependency, skipping",
			"from", edge.FromSlug, "to", edge.ToSlug, "type", edge.Type)
		return
	}
	_, err := pool.Exec(ctx,
		`INSERT INTO task_dependency (task_id, depends_on_task_id, type) VALUES ($1, $2, $3)`,
		fromID, toID, edge.Type,
	)
	if err != nil {
		slog.Warn("insert task dependency failed",
			"from", edge.FromSlug, "to", edge.ToSlug, "error", err)
	}
}
