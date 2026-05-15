-- name: CreateTriageProposal :one
INSERT INTO triage_proposal (
    issue_id, workspace_id, status,
    proposed_by_type, proposed_by_id, proposal
) VALUES ($1, $2, 'pending', $3, $4, $5)
RETURNING *;

-- name: GetTriageProposal :one
SELECT * FROM triage_proposal WHERE id = $1;

-- name: GetTriageProposalInWorkspace :one
SELECT * FROM triage_proposal WHERE id = $1 AND workspace_id = $2;

-- name: ListTriageProposalsByIssue :many
SELECT * FROM triage_proposal
WHERE issue_id = $1
ORDER BY created_at DESC;

-- name: UpdateTriageProposalStatus :one
UPDATE triage_proposal SET
    status = $2,
    updated_at = now()
WHERE id = $1
RETURNING *;

-- name: IncrementTaskCounter :one
UPDATE workspace SET task_counter = task_counter + $2
WHERE id = $1
RETURNING task_counter;

-- name: CreateTask :one
INSERT INTO task (
    workspace_id, number, title, description,
    status, priority, suitability, manual_test,
    issue_id, creator_type, creator_id
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
RETURNING *;

-- name: CreateTaskDependency :exec
INSERT INTO task_dependency (task_id, depends_on_task_id, type)
VALUES ($1, $2, $3);

-- name: ListTasksByIssueID :many
SELECT * FROM task
WHERE issue_id = $1
ORDER BY number ASC;

-- name: ListTaskDependenciesByTaskIDs :many
SELECT * FROM task_dependency
WHERE task_id = ANY($1::uuid[]);
