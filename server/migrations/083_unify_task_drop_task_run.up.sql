-- Unify task and task_run into a single table. The "task" table becomes both
-- the planning entity AND the execution entity. task_run is dropped.
-- is_draft is replaced by 'draft' status. Status enum expands to 10 values.
-- transition_mode is dropped (pipeline step config moves to task_dependency).

-- 0. Convert existing data: 'in_progress' → 'running' (old status no longer valid).
UPDATE task SET status = 'running' WHERE status = 'in_progress';
UPDATE task SET status = 'draft' WHERE is_draft = true AND status = 'pending';

-- 1. Drop is_draft and transition_mode (replaced by status enum + task_dependency).
ALTER TABLE task DROP COLUMN IF EXISTS is_draft;
ALTER TABLE task DROP COLUMN IF EXISTS transition_mode;

-- 2. Drop current_run_id (was FK to task_run; no longer needed).
ALTER TABLE task DROP COLUMN current_run_id;

-- 3. Expand status CHECK to 10 values.
ALTER TABLE task DROP CONSTRAINT task_status_check;
ALTER TABLE task ADD CONSTRAINT task_status_check CHECK (
    status IN (
        'draft',            -- skeleton placeholder (replaces is_draft)
        'pending',          -- ready for dispatch but not yet claimed
        'queued',           -- dispatched to daemon, waiting for a worker
        'dispatched',       -- claimed by a runtime
        'running',          -- execution started (replaces in_progress)
        'human_reviewing',  -- paused for human review
        'done',             -- completed successfully
        'failed',           -- execution failed
        'blocked',          -- dependency not met
        'cancelled'         -- manually cancelled
    )
);

-- 4. Add execution columns (from task_run).
ALTER TABLE task ADD COLUMN agent_id UUID REFERENCES agent(id) ON DELETE SET NULL;
ALTER TABLE task ADD COLUMN runtime_id UUID REFERENCES agent_runtime(id) ON DELETE SET NULL;
ALTER TABLE task ADD COLUMN session_id TEXT;
ALTER TABLE task ADD COLUMN work_dir TEXT;
ALTER TABLE task ADD COLUMN dispatched_at TIMESTAMPTZ;
ALTER TABLE task ADD COLUMN started_at TIMESTAMPTZ;
ALTER TABLE task ADD COLUMN completed_at TIMESTAMPTZ;
ALTER TABLE task ADD COLUMN result JSONB;
ALTER TABLE task ADD COLUMN error TEXT;
ALTER TABLE task ADD COLUMN failure_reason TEXT;
ALTER TABLE task ADD COLUMN attempt INT NOT NULL DEFAULT 1;
ALTER TABLE task ADD COLUMN max_attempts INT NOT NULL DEFAULT 3;
ALTER TABLE task ADD COLUMN last_heartbeat_at TIMESTAMPTZ;
ALTER TABLE task ADD COLUMN parent_task_id UUID REFERENCES task(id) ON DELETE SET NULL;
ALTER TABLE task ADD COLUMN context JSONB;
ALTER TABLE task ADD COLUMN trigger_comment_id UUID REFERENCES comment(id) ON DELETE SET NULL;
ALTER TABLE task ADD COLUMN trigger_summary TEXT;
ALTER TABLE task ADD COLUMN chat_session_id UUID REFERENCES chat_session(id) ON DELETE SET NULL;
ALTER TABLE task ADD COLUMN force_fresh_session BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE task ADD COLUMN queue_priority INT NOT NULL DEFAULT 0;

-- 5. Add crew columns (for auto_agent multi-agent execution).
ALTER TABLE task ADD COLUMN config JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE task ADD COLUMN current_turn INT NOT NULL DEFAULT 0;
ALTER TABLE task ADD COLUMN max_turns INT NOT NULL DEFAULT 10;
ALTER TABLE task ADD COLUMN crew_turn INT NOT NULL DEFAULT 0;
ALTER TABLE task ADD COLUMN active_agent_id TEXT;
ALTER TABLE task ADD COLUMN waiting_for TEXT;

-- 6. Add indexes for execution queries.
CREATE INDEX idx_task_agent ON task(agent_id) WHERE agent_id IS NOT NULL;
CREATE INDEX idx_task_runtime_queued ON task(runtime_id, status) WHERE status = 'queued';
CREATE INDEX idx_task_claim_candidates ON task(runtime_id, queue_priority DESC, created_at ASC) WHERE status = 'queued';
CREATE INDEX idx_task_chat_session ON task(chat_session_id) WHERE chat_session_id IS NOT NULL;
CREATE INDEX idx_task_parent ON task(parent_task_id) WHERE parent_task_id IS NOT NULL;

-- 7. Migrate task_message and task_usage FKs from task_run to task.
--    Delete orphan rows first (task_run IDs that don't map to task IDs).
DELETE FROM task_message WHERE task_id NOT IN (SELECT id FROM task);
DELETE FROM task_usage  WHERE task_id NOT IN (SELECT id FROM task);

ALTER TABLE task_message DROP CONSTRAINT task_message_task_id_fkey;
ALTER TABLE task_message ADD CONSTRAINT task_message_task_id_fkey
    FOREIGN KEY (task_id) REFERENCES task(id) ON DELETE CASCADE;

ALTER TABLE task_usage DROP CONSTRAINT task_usage_task_id_fkey;
ALTER TABLE task_usage ADD CONSTRAINT task_usage_task_id_fkey
    FOREIGN KEY (task_id) REFERENCES task(id) ON DELETE CASCADE;

-- 8. Drop task_run table (cascades remaining FKs).
DROP TABLE task_run;
