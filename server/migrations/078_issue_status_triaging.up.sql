-- Add 'triaging' status: issue is being investigated by the triage agent.
ALTER TABLE issue DROP CONSTRAINT issue_status_check;
ALTER TABLE issue ADD CONSTRAINT issue_status_check CHECK (
    status IN ('open', 'triaging', 'triaged', 'backlog', 'todo', 'in_progress', 'in_review', 'done', 'blocked', 'cancelled')
);
