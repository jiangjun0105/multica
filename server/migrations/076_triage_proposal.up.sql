-- Triage proposal: stores the agent's proposed task breakdown for an issue.
-- The proposal JSONB contains the structured plan (tasks + dependencies)
-- submitted by the triage agent via submit_plan. A human approves or
-- rejects; on approve the finalize endpoint materialises the rows.
CREATE TABLE triage_proposal (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    issue_id        UUID NOT NULL REFERENCES issue(id) ON DELETE CASCADE,
    workspace_id    UUID NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
    status          TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'rejected')),
    proposed_by_type TEXT NOT NULL CHECK (proposed_by_type IN ('member', 'agent')),
    proposed_by_id   UUID NOT NULL,
    proposal        JSONB NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_triage_proposal_issue ON triage_proposal(issue_id);
CREATE INDEX idx_triage_proposal_workspace_status ON triage_proposal(workspace_id, status);
