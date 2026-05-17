-- Make pipeline.issue_id optional so a pipeline can span zero or more issues,
-- not just exactly one. Existing rows are unaffected (NOT NULL → nullable is
-- a widening change).
ALTER TABLE pipeline ALTER COLUMN issue_id DROP NOT NULL;
