ALTER TABLE task_run DROP COLUMN IF EXISTS autopilot_run_id;

ALTER TABLE issue DROP CONSTRAINT IF EXISTS issue_origin_type_check;
ALTER TABLE issue ADD CONSTRAINT issue_origin_type_check
    CHECK (origin_type IN ('quick_create'));

DROP TABLE IF EXISTS autopilot_run;
DROP TABLE IF EXISTS autopilot_trigger;
DROP TABLE IF EXISTS autopilot;
