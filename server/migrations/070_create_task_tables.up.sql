-- Create the task table: a planning unit representing a scoped work item
-- derived from issue triage. Each task may have zero or more task_run rows
-- (execution attempts).

CREATE TABLE task (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    UUID NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
    number          INT  NOT NULL,
    title           TEXT NOT NULL,
    description     TEXT NOT NULL DEFAULT '',

    status          TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'in_progress', 'done', 'blocked', 'cancelled')),
    priority        TEXT NOT NULL DEFAULT 'medium'
        CHECK (priority IN ('high', 'medium', 'low')),

    suitability     TEXT
        CHECK (suitability IN ('auto_agent_ready', 'needs_design', 'needs_human', 'unknown')),
    branch          TEXT,
    pr              TEXT,
    manual_test     TEXT,

    issue_id        UUID REFERENCES issue(id) ON DELETE SET NULL,
    current_run_id  UUID REFERENCES task_run(id) ON DELETE SET NULL,

    creator_type    TEXT NOT NULL CHECK (creator_type IN ('member', 'agent')),
    creator_id      UUID NOT NULL,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (workspace_id, number)
);

CREATE INDEX idx_task_workspace_status ON task(workspace_id, status);
CREATE INDEX idx_task_issue ON task(issue_id) WHERE issue_id IS NOT NULL;

-- Task dependency edges for blocking/related relationships.
CREATE TABLE task_dependency (
    task_id            UUID NOT NULL REFERENCES task(id) ON DELETE CASCADE,
    depends_on_task_id UUID NOT NULL REFERENCES task(id) ON DELETE CASCADE,
    type               TEXT NOT NULL CHECK (type IN ('blocks', 'blocked_by', 'related')),
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (task_id, depends_on_task_id, type)
);

CREATE INDEX idx_task_dependency_dep ON task_dependency(depends_on_task_id);
