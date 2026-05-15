-- Add task_counter to workspace for human-readable task numbers (mirrors issue_counter).
ALTER TABLE workspace
    ADD COLUMN task_counter INT NOT NULL DEFAULT 0;

-- Back-fill from existing task rows so new numbers don't collide.
UPDATE workspace SET task_counter = COALESCE(
    (SELECT MAX(number) FROM task WHERE task.workspace_id = workspace.id), 0
);
