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

-- name: ListTasksByIssueID :many
SELECT * FROM task
WHERE issue_id = $1
ORDER BY number ASC;

-- name: ListTaskDependenciesByTaskIDs :many
SELECT * FROM task_dependency
WHERE task_id = ANY($1::uuid[]);
