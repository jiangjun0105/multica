-- Extend issue.status CHECK constraint to include SB statuses:
--   'open'    – captured but not yet investigated
--   'triaged' – investigated, tasks created
ALTER TABLE issue DROP CONSTRAINT issue_status_check;
ALTER TABLE issue ADD CONSTRAINT issue_status_check CHECK (
    status IN ('open', 'triaged', 'backlog', 'todo', 'in_progress', 'in_review', 'done', 'blocked', 'cancelled')
);
