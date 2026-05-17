-- Add is_draft to task. A draft task is one that has been planned (e.g. as
-- part of a pipeline import) but is not yet ready for an agent to pick up —
-- it's still being authored. Mirrors auto-agent's auto_agent_tasks.is_draft.
ALTER TABLE task ADD COLUMN is_draft BOOLEAN NOT NULL DEFAULT false;
