-- Reverse: recreate task_run, move execution columns back, restore old status CHECK.

-- 1. Recreate task_run table.
CREATE TABLE task_run (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID REFERENCES agent(id) ON DELETE SET NULL,
    task_id UUID,
    status TEXT NOT NULL DEFAULT 'queued'
        CHECK (status IN ('queued', 'dispatched', 'running', 'completed', 'failed', 'cancelled')),
    priority INT NOT NULL DEFAULT 0,
    dispatched_at TIMESTAMPTZ,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    result JSONB,
    error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    context JSONB,
    runtime_id UUID REFERENCES agent_runtime(id) ON DELETE SET NULL,
    session_id TEXT,
    work_dir TEXT,
    trigger_comment_id UUID REFERENCES comment(id) ON DELETE SET NULL,
    chat_session_id UUID REFERENCES chat_session(id) ON DELETE SET NULL,
    attempt INT NOT NULL DEFAULT 1,
    max_attempts INT NOT NULL DEFAULT 3,
    parent_task_id UUID REFERENCES task_run(id) ON DELETE SET NULL,
    failure_reason TEXT,
    last_heartbeat_at TIMESTAMPTZ,
    trigger_summary TEXT,
    force_fresh_session BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX idx_task_run_agent ON task_run(agent_id);
CREATE INDEX idx_task_run_pending ON task_run(status) WHERE status IN ('queued', 'dispatched');
CREATE INDEX idx_task_run_claim_candidates ON task_run(runtime_id, priority DESC, created_at ASC) WHERE status = 'queued';

-- 2. Restore task_message FK to task_run.
ALTER TABLE task_message DROP CONSTRAINT task_message_task_id_fkey;
ALTER TABLE task_message ADD CONSTRAINT task_message_task_id_fkey
    FOREIGN KEY (task_id) REFERENCES task_run(id) ON DELETE CASCADE;

-- 3. Restore task_usage FK to task_run.
ALTER TABLE task_usage DROP CONSTRAINT task_usage_task_id_fkey;
ALTER TABLE task_usage ADD CONSTRAINT task_usage_task_id_fkey
    FOREIGN KEY (task_id) REFERENCES task_run(id) ON DELETE CASCADE;

-- 4. Drop execution indexes from task.
DROP INDEX IF EXISTS idx_task_agent;
DROP INDEX IF EXISTS idx_task_runtime_queued;
DROP INDEX IF EXISTS idx_task_claim_candidates;
DROP INDEX IF EXISTS idx_task_chat_session;
DROP INDEX IF EXISTS idx_task_parent;

-- 5. Drop crew columns from task.
ALTER TABLE task DROP COLUMN IF EXISTS waiting_for;
ALTER TABLE task DROP COLUMN IF EXISTS active_agent_id;
ALTER TABLE task DROP COLUMN IF EXISTS crew_turn;
ALTER TABLE task DROP COLUMN IF EXISTS max_turns;
ALTER TABLE task DROP COLUMN IF EXISTS current_turn;
ALTER TABLE task DROP COLUMN IF EXISTS config;

-- 6. Drop execution columns from task.
ALTER TABLE task DROP COLUMN IF EXISTS queue_priority;
ALTER TABLE task DROP COLUMN IF EXISTS force_fresh_session;
ALTER TABLE task DROP COLUMN IF EXISTS chat_session_id;
ALTER TABLE task DROP COLUMN IF EXISTS trigger_summary;
ALTER TABLE task DROP COLUMN IF EXISTS trigger_comment_id;
ALTER TABLE task DROP COLUMN IF EXISTS context;
ALTER TABLE task DROP COLUMN IF EXISTS parent_task_id;
ALTER TABLE task DROP COLUMN IF EXISTS last_heartbeat_at;
ALTER TABLE task DROP COLUMN IF EXISTS max_attempts;
ALTER TABLE task DROP COLUMN IF EXISTS attempt;
ALTER TABLE task DROP COLUMN IF EXISTS failure_reason;
ALTER TABLE task DROP COLUMN IF EXISTS error;
ALTER TABLE task DROP COLUMN IF EXISTS result;
ALTER TABLE task DROP COLUMN IF EXISTS completed_at;
ALTER TABLE task DROP COLUMN IF EXISTS started_at;
ALTER TABLE task DROP COLUMN IF EXISTS dispatched_at;
ALTER TABLE task DROP COLUMN IF EXISTS work_dir;
ALTER TABLE task DROP COLUMN IF EXISTS session_id;
ALTER TABLE task DROP COLUMN IF EXISTS runtime_id;
ALTER TABLE task DROP COLUMN IF EXISTS agent_id;

-- 7. Convert status values back before restoring the old CHECK constraint.
UPDATE task SET status = 'in_progress' WHERE status = 'running';
UPDATE task SET status = 'pending' WHERE status IN ('draft', 'queued', 'dispatched', 'human_reviewing', 'failed');

-- 8. Restore original 5-value status CHECK.
ALTER TABLE task DROP CONSTRAINT task_status_check;
ALTER TABLE task ADD CONSTRAINT task_status_check CHECK (
    status IN ('pending', 'in_progress', 'done', 'blocked', 'cancelled')
);

-- 9. Restore current_run_id, is_draft, transition_mode columns.
ALTER TABLE task ADD COLUMN current_run_id UUID REFERENCES task_run(id) ON DELETE SET NULL;
ALTER TABLE task ADD COLUMN is_draft BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE task ADD COLUMN transition_mode TEXT NOT NULL DEFAULT 'manual'
    CHECK (transition_mode IN ('auto', 'manual'));
