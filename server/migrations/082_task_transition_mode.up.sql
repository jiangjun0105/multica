-- transition_mode controls how a pipeline advances past this task:
--   'manual' — wait for a human/agent to mark it done before unblocking
--              downstream tasks (the default; matches existing behavior).
--   'auto'   — downstream tasks unblock as soon as this one finishes,
--              no human in the loop.
--
-- The DAG view renders manual edges as dashed and auto edges as solid.
-- Mirrors auto-agent's pipeline_step.transition_mode.
ALTER TABLE task ADD COLUMN transition_mode TEXT NOT NULL DEFAULT 'manual'
    CHECK (transition_mode IN ('auto', 'manual'));
