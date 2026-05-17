-- name: ListAgents :many
SELECT * FROM agent
WHERE workspace_id = $1 AND archived_at IS NULL
ORDER BY created_at ASC;

-- name: ListAllAgents :many
SELECT * FROM agent
WHERE workspace_id = $1
ORDER BY created_at ASC;

-- name: GetAgent :one
SELECT * FROM agent
WHERE id = $1;

-- name: GetAgentInWorkspace :one
SELECT * FROM agent
WHERE id = $1 AND workspace_id = $2;

-- name: CreateAgent :one
INSERT INTO agent (
    workspace_id, name, description, avatar_url,
    runtime_config, runtime_id, visibility, max_concurrent_tasks, owner_id,
    instructions, custom_env, custom_args, mcp_config, model
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
RETURNING *;

-- name: UpdateAgent :one
UPDATE agent SET
    name = COALESCE(sqlc.narg('name'), name),
    description = COALESCE(sqlc.narg('description'), description),
    avatar_url = COALESCE(sqlc.narg('avatar_url'), avatar_url),
    runtime_config = COALESCE(sqlc.narg('runtime_config'), runtime_config),
    runtime_id = COALESCE(sqlc.narg('runtime_id'), runtime_id),
    visibility = COALESCE(sqlc.narg('visibility'), visibility),
    status = COALESCE(sqlc.narg('status'), status),
    max_concurrent_tasks = COALESCE(sqlc.narg('max_concurrent_tasks'), max_concurrent_tasks),
    instructions = COALESCE(sqlc.narg('instructions'), instructions),
    custom_env = COALESCE(sqlc.narg('custom_env'), custom_env),
    custom_args = COALESCE(sqlc.narg('custom_args'), custom_args),
    mcp_config = COALESCE(sqlc.narg('mcp_config'), mcp_config),
    model = COALESCE(sqlc.narg('model'), model),
    updated_at = now()
WHERE id = $1
RETURNING *;

-- name: ClearAgentMcpConfig :one
UPDATE agent SET mcp_config = NULL, updated_at = now()
WHERE id = $1
RETURNING *;

-- name: ArchiveAgent :one
UPDATE agent SET archived_at = now(), archived_by = $2, updated_at = now()
WHERE id = $1
RETURNING *;

-- name: RestoreAgent :one
UPDATE agent SET archived_at = NULL, archived_by = NULL, updated_at = now()
WHERE id = $1
RETURNING *;

-- name: ListAgentTasks :many
SELECT * FROM task
WHERE agent_id = $1
ORDER BY created_at DESC;

-- name: CreateAgentTask :one
INSERT INTO task (
    workspace_id, number, title, description,
    agent_id, runtime_id, issue_id, status, queue_priority,
    trigger_comment_id, trigger_summary, force_fresh_session,
    creator_type, creator_id
)
VALUES (
    $1, $2, $3, '',
    $4, $5, sqlc.narg('issue_id'), 'queued', $6,
    sqlc.narg('trigger_comment_id'), sqlc.narg('trigger_summary'),
    COALESCE(sqlc.narg('force_fresh_session')::boolean, FALSE),
    $7, $8
)
RETURNING *;

-- name: CreateQuickCreateTask :one
INSERT INTO task (
    workspace_id, number, title, description,
    agent_id, runtime_id, issue_id, status, queue_priority, context,
    creator_type, creator_id
)
VALUES ($1, $2, $3, '', $4, $5, NULL, 'queued', $6, $7, $8, $9)
RETURNING *;

-- name: LinkTaskToIssue :exec
UPDATE task
SET issue_id = $2
WHERE id = $1 AND issue_id IS NULL;

-- name: CreateRetryTask :one
INSERT INTO task (
    workspace_id, number, title, description,
    agent_id, runtime_id, issue_id, chat_session_id,
    status, queue_priority, trigger_comment_id, trigger_summary, context,
    session_id, work_dir, attempt, max_attempts, parent_task_id,
    creator_type, creator_id, priority, suitability, pipeline_id
)
SELECT
    p.workspace_id, $2, p.title, p.description,
    p.agent_id, p.runtime_id, p.issue_id, p.chat_session_id,
    'queued', p.queue_priority, p.trigger_comment_id, p.trigger_summary, p.context,
    p.session_id, p.work_dir, p.attempt + 1, p.max_attempts, p.id,
    p.creator_type, p.creator_id, p.priority, p.suitability, p.pipeline_id
FROM task p
WHERE p.id = $1
RETURNING *;

-- name: CancelAgentTasksByIssue :many
UPDATE task
SET status = 'cancelled', completed_at = now(), updated_at = now()
WHERE issue_id = $1 AND status IN ('queued', 'dispatched', 'running')
RETURNING *;

-- name: CancelAgentTasksByIssueAndAgent :many
UPDATE task
SET status = 'cancelled', completed_at = now(), updated_at = now()
WHERE issue_id = $1 AND agent_id = $2 AND status IN ('queued', 'dispatched', 'running')
RETURNING *;

-- name: CancelAgentTasksByAgent :many
UPDATE task
SET status = 'cancelled', completed_at = now(), updated_at = now()
WHERE agent_id = $1 AND status IN ('queued', 'dispatched', 'running')
RETURNING *;

-- name: CancelAgentTasksByTriggerComment :many
UPDATE task
SET status = 'cancelled', completed_at = now(), updated_at = now()
WHERE trigger_comment_id = $1 AND status IN ('queued', 'dispatched', 'running')
RETURNING *;

-- name: GetAgentTask :one
SELECT * FROM task
WHERE id = $1;

-- name: ClaimAgentTask :one
UPDATE task
SET status = 'dispatched', dispatched_at = now(), updated_at = now()
WHERE id = (
    SELECT atq.id FROM task atq
    WHERE atq.agent_id = $1 AND atq.status = 'queued'
      AND NOT EXISTS (
          SELECT 1 FROM task active
          WHERE active.agent_id = atq.agent_id
            AND active.status IN ('dispatched', 'running')
            AND (
              (atq.issue_id IS NOT NULL AND active.issue_id = atq.issue_id)
              OR (atq.chat_session_id IS NOT NULL AND active.chat_session_id = atq.chat_session_id)
              OR (
                atq.issue_id IS NULL
                AND atq.chat_session_id IS NULL
                AND active.issue_id IS NULL
                AND active.chat_session_id IS NULL
              )
            )
      )
      AND NOT EXISTS (
          SELECT 1
          FROM task_dependency td
          JOIN task blocker ON blocker.id = td.depends_on_task_id AND blocker.status <> 'done'
          WHERE td.task_id = atq.id AND td.type = 'blocked_by'
      )
    ORDER BY atq.queue_priority DESC, atq.created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
)
RETURNING *;

-- name: StartAgentTask :one
UPDATE task
SET status = 'running', started_at = now(), updated_at = now()
WHERE id = $1 AND status = 'dispatched'
RETURNING *;

-- name: CompleteAgentTask :one
UPDATE task
SET status = 'done', completed_at = now(), result = $2, session_id = $3, work_dir = $4, updated_at = now()
WHERE id = $1 AND status = 'running'
RETURNING *;

-- name: GetLastTaskSession :one
SELECT session_id, work_dir, runtime_id FROM task
WHERE agent_id = $1 AND issue_id = $2
  AND (
    status = 'done'
    OR (status = 'failed' AND COALESCE(failure_reason, '') NOT IN ('iteration_limit', 'agent_fallback_message'))
  )
  AND session_id IS NOT NULL
ORDER BY COALESCE(completed_at, started_at, dispatched_at, created_at) DESC
LIMIT 1;

-- name: FailAgentTask :one
UPDATE task
SET status = 'failed',
    completed_at = now(),
    error = $2,
    failure_reason = COALESCE(sqlc.narg('failure_reason'), 'agent_error'),
    session_id = COALESCE(sqlc.narg('session_id'), session_id),
    work_dir = COALESCE(sqlc.narg('work_dir'), work_dir),
    updated_at = now()
WHERE id = $1 AND status IN ('dispatched', 'running')
RETURNING *;

-- name: UpdateAgentTaskSession :exec
UPDATE task
SET session_id = COALESCE(sqlc.narg('session_id'), session_id),
    work_dir  = COALESCE(sqlc.narg('work_dir'), work_dir),
    last_heartbeat_at = now()
WHERE id = $1 AND status IN ('dispatched', 'running');

-- name: RecoverOrphanedTasksForRuntime :many
UPDATE task
SET status = 'failed',
    completed_at = now(),
    error = 'daemon restarted while task was in flight',
    failure_reason = 'runtime_recovery',
    updated_at = now()
WHERE runtime_id = $1 AND status IN ('dispatched', 'running')
RETURNING *;

-- name: FailStaleTasks :many
UPDATE task
SET status = 'failed', completed_at = now(), error = 'task timed out',
    failure_reason = 'timeout', updated_at = now()
WHERE (status = 'dispatched' AND dispatched_at < now() - make_interval(secs => @dispatch_timeout_secs::double precision))
   OR (status = 'running' AND started_at < now() - make_interval(secs => @running_timeout_secs::double precision))
RETURNING *;

-- name: CancelAgentTask :one
UPDATE task
SET status = 'cancelled', completed_at = now(), updated_at = now()
WHERE id = $1 AND status IN ('queued', 'dispatched', 'running')
RETURNING *;

-- name: CountRunningTasks :one
SELECT count(*) FROM task
WHERE agent_id = $1 AND status IN ('dispatched', 'running');

-- name: HasActiveTaskForIssue :one
SELECT count(*) > 0 AS has_active FROM task
WHERE issue_id = $1 AND status IN ('queued', 'dispatched', 'running');

-- name: HasPendingTaskForIssue :one
SELECT count(*) > 0 AS has_pending FROM task
WHERE issue_id = $1 AND status IN ('queued', 'dispatched');

-- name: HasPendingTaskForIssueAndAgent :one
SELECT count(*) > 0 AS has_pending FROM task
WHERE issue_id = $1 AND agent_id = $2 AND status IN ('queued', 'dispatched');

-- name: ListPendingTasksByRuntime :many
SELECT * FROM task
WHERE runtime_id = $1 AND status IN ('queued', 'dispatched')
ORDER BY queue_priority DESC, created_at ASC;

-- name: ListQueuedClaimCandidatesByRuntime :many
SELECT t.* FROM task t
WHERE t.runtime_id = $1 AND t.status = 'queued'
  AND NOT EXISTS (
      SELECT 1
      FROM task_dependency td
      JOIN task blocker ON blocker.id = td.depends_on_task_id AND blocker.status <> 'done'
      WHERE td.task_id = t.id AND td.type = 'blocked_by'
  )
ORDER BY t.queue_priority DESC, t.created_at ASC;

-- name: ListActiveTasksByIssue :many
SELECT * FROM task
WHERE issue_id = $1 AND status IN ('dispatched', 'running')
ORDER BY created_at DESC;

-- name: GetWorkspaceAgentRunCounts :many
SELECT
    t.agent_id,
    COUNT(*)::int AS run_count
FROM task t
WHERE t.workspace_id = $1
  AND t.agent_id IS NOT NULL
  AND t.created_at > now() - INTERVAL '30 days'
GROUP BY t.agent_id;

-- name: GetWorkspaceAgentActivity30d :many
SELECT
    t.agent_id,
    DATE_TRUNC('day', t.completed_at)::timestamptz AS bucket,
    COUNT(*)::int AS task_count,
    COUNT(*) FILTER (WHERE t.status = 'failed')::int AS failed_count
FROM task t
WHERE t.workspace_id = $1
  AND t.agent_id IS NOT NULL
  AND t.completed_at IS NOT NULL
  AND t.completed_at > now() - INTERVAL '30 days'
GROUP BY t.agent_id, bucket
ORDER BY t.agent_id, bucket;

-- name: ListWorkspaceAgentTaskSnapshot :many
SELECT active.* FROM task active
WHERE active.workspace_id = $1
  AND active.agent_id IS NOT NULL
  AND active.status IN ('queued', 'dispatched', 'running')

UNION ALL

SELECT t.* FROM (
  SELECT DISTINCT ON (tsk.agent_id) tsk.*
  FROM task tsk
  WHERE tsk.workspace_id = $1
    AND tsk.agent_id IS NOT NULL
    AND tsk.status IN ('done', 'failed')
  ORDER BY tsk.agent_id, tsk.completed_at DESC NULLS LAST
) t;

-- name: ListTasksByIssue :many
SELECT * FROM task
WHERE issue_id = $1
ORDER BY created_at DESC;

-- name: UpdateAgentStatus :one
UPDATE agent SET status = $2, updated_at = now()
WHERE id = $1
RETURNING *;

-- name: RefreshAgentStatusFromTasks :one
UPDATE agent AS a
SET status = CASE WHEN EXISTS (
    SELECT 1 FROM task q
    WHERE q.agent_id = a.id AND q.status IN ('dispatched', 'running')
) THEN 'working' ELSE 'idle' END,
    updated_at = now()
WHERE a.id = $1
RETURNING *;
