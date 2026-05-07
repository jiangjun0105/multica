-- Reverse the rename: task_run → agent_task_queue.

-- Indexes
ALTER INDEX idx_task_run_claim_candidates RENAME TO idx_agent_task_queue_claim_candidates;
ALTER INDEX idx_task_run_parent RENAME TO idx_agent_task_queue_parent;
ALTER INDEX idx_task_run_chat_pending RENAME TO idx_agent_task_queue_chat_pending;
ALTER INDEX idx_one_pending_run_per_task_agent RENAME TO idx_one_pending_task_per_issue_agent;
ALTER INDEX idx_task_run_task_id RENAME TO idx_agent_task_queue_issue_id;
ALTER INDEX idx_task_run_runtime_pending RENAME TO idx_agent_task_queue_runtime_pending;
ALTER INDEX idx_task_run_pending RENAME TO idx_agent_task_queue_pending;
ALTER INDEX idx_task_run_agent RENAME TO idx_agent_task_queue_agent;

-- FK constraints
ALTER TABLE task_run RENAME CONSTRAINT task_run_autopilot_run_id_fkey TO agent_task_queue_autopilot_run_id_fkey;
ALTER TABLE task_run RENAME CONSTRAINT task_run_parent_task_id_fkey TO agent_task_queue_parent_task_id_fkey;
ALTER TABLE task_run RENAME CONSTRAINT task_run_chat_session_id_fkey TO agent_task_queue_chat_session_id_fkey;
ALTER TABLE task_run RENAME CONSTRAINT task_run_trigger_comment_id_fkey TO agent_task_queue_trigger_comment_id_fkey;
ALTER TABLE task_run RENAME CONSTRAINT task_run_runtime_id_fkey TO agent_task_queue_runtime_id_fkey;
ALTER TABLE task_run RENAME CONSTRAINT task_run_task_id_fkey TO agent_task_queue_issue_id_fkey;
ALTER TABLE task_run RENAME CONSTRAINT task_run_agent_id_fkey TO agent_task_queue_agent_id_fkey;

-- CHECK constraint
ALTER TABLE task_run RENAME CONSTRAINT task_run_status_check TO agent_task_queue_status_check;

-- Primary key
ALTER INDEX task_run_pkey RENAME TO agent_task_queue_pkey;

-- Column
ALTER TABLE task_run RENAME COLUMN task_id TO issue_id;

-- Table
ALTER TABLE task_run RENAME TO agent_task_queue;
