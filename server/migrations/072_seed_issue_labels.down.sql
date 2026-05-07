-- Remove the seeded labels. Only deletes labels with exact names that were
-- seeded and have no issues attached (ON DELETE CASCADE on issue_to_label
-- would remove associations otherwise).
DELETE FROM issue_label
WHERE name IN ('bug', 'feature', 'idea', 'exploration');
