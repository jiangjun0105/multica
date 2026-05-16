ALTER TABLE issue DROP CONSTRAINT issue_status_check;
ALTER TABLE issue ADD CONSTRAINT issue_status_check CHECK (
    status IN ('open', 'triaged', 'backlog', 'todo', 'in_progress', 'in_review', 'done', 'blocked', 'cancelled')
);
