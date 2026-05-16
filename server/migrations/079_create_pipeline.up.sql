CREATE TABLE pipeline (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    UUID NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
    issue_id        UUID NOT NULL REFERENCES issue(id) ON DELETE CASCADE,
    status          TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
    creator_type    TEXT NOT NULL CHECK (creator_type IN ('member', 'agent')),
    creator_id      UUID NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pipeline_workspace ON pipeline(workspace_id);
CREATE INDEX idx_pipeline_issue ON pipeline(issue_id);

ALTER TABLE task ADD COLUMN pipeline_id UUID REFERENCES pipeline(id) ON DELETE SET NULL;
CREATE INDEX idx_task_pipeline ON task(pipeline_id) WHERE pipeline_id IS NOT NULL;
