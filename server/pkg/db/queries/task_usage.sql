-- name: UpsertTaskUsage :exec
INSERT INTO task_usage (task_id, provider, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens)
VALUES ($1, $2, $3, $4, $5, $6, $7)
ON CONFLICT (task_id, provider, model)
DO UPDATE SET
    input_tokens = EXCLUDED.input_tokens,
    output_tokens = EXCLUDED.output_tokens,
    cache_read_tokens = EXCLUDED.cache_read_tokens,
    cache_write_tokens = EXCLUDED.cache_write_tokens;

-- name: GetTaskUsage :many
SELECT * FROM task_usage
WHERE task_id = $1
ORDER BY model;

-- name: GetWorkspaceUsageByDay :many
SELECT
    DATE(tu.created_at) AS date,
    tu.model,
    SUM(tu.input_tokens)::bigint AS total_input_tokens,
    SUM(tu.output_tokens)::bigint AS total_output_tokens,
    SUM(tu.cache_read_tokens)::bigint AS total_cache_read_tokens,
    SUM(tu.cache_write_tokens)::bigint AS total_cache_write_tokens,
    COUNT(DISTINCT tu.task_id)::int AS task_count
FROM task_usage tu
JOIN task t ON t.id = tu.task_id
WHERE t.workspace_id = $1
  AND tu.created_at >= DATE_TRUNC('day', @since::timestamptz)
GROUP BY DATE(tu.created_at), tu.model
ORDER BY DATE(tu.created_at) DESC, tu.model;

-- name: GetWorkspaceUsageSummary :many
SELECT
    tu.model,
    SUM(tu.input_tokens)::bigint AS total_input_tokens,
    SUM(tu.output_tokens)::bigint AS total_output_tokens,
    SUM(tu.cache_read_tokens)::bigint AS total_cache_read_tokens,
    SUM(tu.cache_write_tokens)::bigint AS total_cache_write_tokens,
    COUNT(DISTINCT tu.task_id)::int AS task_count
FROM task_usage tu
JOIN task t ON t.id = tu.task_id
WHERE t.workspace_id = $1
  AND tu.created_at >= DATE_TRUNC('day', @since::timestamptz)
GROUP BY tu.model
ORDER BY (SUM(tu.input_tokens) + SUM(tu.output_tokens)) DESC;

-- name: GetIssueUsageSummary :one
SELECT
    COALESCE(SUM(tu.input_tokens), 0)::bigint AS total_input_tokens,
    COALESCE(SUM(tu.output_tokens), 0)::bigint AS total_output_tokens,
    COALESCE(SUM(tu.cache_read_tokens), 0)::bigint AS total_cache_read_tokens,
    COALESCE(SUM(tu.cache_write_tokens), 0)::bigint AS total_cache_write_tokens,
    COUNT(DISTINCT tu.task_id)::int AS task_count
FROM task_usage tu
JOIN task t ON t.id = tu.task_id
WHERE t.issue_id = $1;
