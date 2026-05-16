-- Restoring NOT NULL would fail if any rows have issue_id IS NULL.
-- Delete those orphans first, then re-enforce NOT NULL.
DELETE FROM pipeline WHERE issue_id IS NULL;
ALTER TABLE pipeline ALTER COLUMN issue_id SET NOT NULL;
