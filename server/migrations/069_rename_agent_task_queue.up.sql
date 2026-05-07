-- Rename agent_task_queue → task_run.
-- With a real "task" table arriving in migration 070, each row in this table
-- represents one execution attempt of a task. The column issue_id is renamed
-- to task_id (still nullable for chat-only runs).

-- 1. Rename table
ALTER TABLE agent_task_queue RENAME TO task_run;

-- 2. Rename column
ALTER TABLE task_run RENAME COLUMN issue_id TO task_id;

-- 3. Rename primary key constraint
ALTER INDEX agent_task_queue_pkey RENAME TO task_run_pkey;

-- 4. Rename CHECK constraint
ALTER TABLE task_run RENAME CONSTRAINT agent_task_queue_status_check TO task_run_status_check;

-- 5. Rename FK constraints on task_run
ALTER TABLE task_run RENAME CONSTRAINT agent_task_queue_agent_id_fkey TO task_run_agent_id_fkey;
ALTER TABLE task_run RENAME CONSTRAINT agent_task_queue_issue_id_fkey TO task_run_task_id_fkey;
ALTER TABLE task_run RENAME CONSTRAINT agent_task_queue_runtime_id_fkey TO task_run_runtime_id_fkey;
ALTER TABLE task_run RENAME CONSTRAINT agent_task_queue_trigger_comment_id_fkey TO task_run_trigger_comment_id_fkey;
ALTER TABLE task_run RENAME CONSTRAINT agent_task_queue_chat_session_id_fkey TO task_run_chat_session_id_fkey;
ALTER TABLE task_run RENAME CONSTRAINT agent_task_queue_parent_task_id_fkey TO task_run_parent_task_id_fkey;
ALTER TABLE task_run RENAME CONSTRAINT agent_task_queue_autopilot_run_id_fkey TO task_run_autopilot_run_id_fkey;

-- 6. Rename indexes
ALTER INDEX idx_agent_task_queue_agent RENAME TO idx_task_run_agent;
ALTER INDEX idx_agent_task_queue_pending RENAME TO idx_task_run_pending;
ALTER INDEX idx_agent_task_queue_runtime_pending RENAME TO idx_task_run_runtime_pending;
ALTER INDEX idx_agent_task_queue_issue_id RENAME TO idx_task_run_task_id;
ALTER INDEX idx_one_pending_task_per_issue_agent RENAME TO idx_one_pending_run_per_task_agent;
ALTER INDEX idx_agent_task_queue_chat_pending RENAME TO idx_task_run_chat_pending;
ALTER INDEX idx_agent_task_queue_parent RENAME TO idx_task_run_parent;
ALTER INDEX idx_agent_task_queue_claim_candidates RENAME TO idx_task_run_claim_candidates;
