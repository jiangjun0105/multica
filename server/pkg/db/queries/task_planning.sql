-- Task planning queries (the "task" table — not task_run).

-- name: CreateTask :one
INSERT INTO task (
    workspace_id, number, title, description, status, priority,
    suitability, manual_test, issue_id, pipeline_id, creator_type, creator_id
) VALUES (
    $1, $2, $3, $4, $5, $6,
    sqlc.narg('suitability'), sqlc.narg('manual_test'), sqlc.narg('issue_id'),
    sqlc.narg('pipeline_id'), $7, $8
) RETURNING *;

-- name: GetTask :one
SELECT * FROM task WHERE id = $1;

-- name: GetTaskInWorkspace :one
SELECT * FROM task WHERE id = $1 AND workspace_id = $2;

-- name: ListTasks :many
SELECT * FROM task
WHERE workspace_id = $1
  AND (sqlc.narg('status')::text IS NULL OR status = sqlc.narg('status'))
  AND (sqlc.narg('priority')::text IS NULL OR priority = sqlc.narg('priority'))
  AND (sqlc.narg('issue_id')::uuid IS NULL OR issue_id = sqlc.narg('issue_id'))
ORDER BY created_at DESC
LIMIT $2 OFFSET $3;

-- name: CountTasks :one
SELECT count(*) FROM task
WHERE workspace_id = $1
  AND (sqlc.narg('status')::text IS NULL OR status = sqlc.narg('status'))
  AND (sqlc.narg('priority')::text IS NULL OR priority = sqlc.narg('priority'))
  AND (sqlc.narg('issue_id')::uuid IS NULL OR issue_id = sqlc.narg('issue_id'));

-- name: UpdateTask :one
UPDATE task SET
    title = COALESCE(sqlc.narg('title'), title),
    description = COALESCE(sqlc.narg('description'), description),
    status = COALESCE(sqlc.narg('status'), status),
    priority = COALESCE(sqlc.narg('priority'), priority),
    suitability = sqlc.narg('suitability'),
    branch = sqlc.narg('branch'),
    pr = sqlc.narg('pr'),
    manual_test = sqlc.narg('manual_test'),
    issue_id = sqlc.narg('issue_id'),
    current_run_id = sqlc.narg('current_run_id'),
    pipeline_id = sqlc.narg('pipeline_id'),
    updated_at = now()
WHERE id = $1 AND workspace_id = $2
RETURNING *;

-- name: DeleteTask :one
DELETE FROM task
WHERE id = $1 AND workspace_id = $2
RETURNING id;

-- name: IncrementTaskCounter :one
UPDATE workspace SET task_counter = task_counter + $2
WHERE id = $1
RETURNING task_counter;

-- name: UpdateTaskStatus :one
UPDATE task SET
    status = $2,
    updated_at = now()
WHERE id = $1
RETURNING *;

-- Task dependency queries.

-- name: CreateTaskDependency :exec
INSERT INTO task_dependency (task_id, depends_on_task_id, type)
VALUES ($1, $2, $3)
ON CONFLICT DO NOTHING;

-- name: DeleteTaskDependency :exec
DELETE FROM task_dependency
WHERE task_id = $1 AND depends_on_task_id = $2 AND type = $3;

-- name: ListTaskDependencies :many
SELECT * FROM task_dependency
WHERE task_id = $1
ORDER BY created_at;

-- name: ListTaskDependents :many
SELECT * FROM task_dependency
WHERE depends_on_task_id = $1
ORDER BY created_at;
