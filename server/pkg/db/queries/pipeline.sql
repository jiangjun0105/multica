-- Pipeline queries.

-- name: CreatePipeline :one
INSERT INTO pipeline (
    workspace_id, issue_id, status, creator_type, creator_id
) VALUES ($1, $2, $3, $4, $5)
RETURNING *;

-- name: GetPipeline :one
SELECT * FROM pipeline WHERE id = $1;

-- name: GetPipelineInWorkspace :one
SELECT * FROM pipeline WHERE id = $1 AND workspace_id = $2;

-- name: ListPipelines :many
SELECT * FROM pipeline
WHERE workspace_id = $1
ORDER BY created_at DESC
LIMIT $2 OFFSET $3;

-- name: CountPipelines :one
SELECT count(*) FROM pipeline WHERE workspace_id = $1;

-- name: UpdatePipelineStatus :one
UPDATE pipeline SET
    status = $2,
    updated_at = now()
WHERE id = $1
RETURNING *;

-- name: ListTasksByPipelineID :many
SELECT * FROM task
WHERE pipeline_id = $1
ORDER BY number ASC;

-- name: GetPipelineByIssueID :one
SELECT * FROM pipeline
WHERE issue_id = $1 AND workspace_id = $2
ORDER BY created_at DESC
LIMIT 1;
