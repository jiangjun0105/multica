-- Seed default issue labels (bug, feature, idea, exploration) for every
-- existing workspace. The importer also creates them defensively per
-- workspace on first run.
INSERT INTO issue_label (workspace_id, name, color)
SELECT w.id, v.name, v.color
FROM workspace w
CROSS JOIN (VALUES
    ('bug',         '#ef4444'),
    ('feature',     '#22c55e'),
    ('idea',        '#eab308'),
    ('exploration', '#3b82f6')
) AS v(name, color)
WHERE NOT EXISTS (
    SELECT 1 FROM issue_label il
    WHERE il.workspace_id = w.id AND il.name = v.name
);
