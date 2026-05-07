-- Remove 'open' and 'triaged' from issue.status CHECK constraint.
-- Rows with those statuses must be cleaned up before rolling back.
ALTER TABLE issue DROP CONSTRAINT issue_status_check;
ALTER TABLE issue ADD CONSTRAINT issue_status_check CHECK (
    status IN ('backlog', 'todo', 'in_progress', 'in_review', 'done', 'blocked', 'cancelled')
);
