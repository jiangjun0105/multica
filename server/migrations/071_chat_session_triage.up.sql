-- Add triage anchoring to chat_session: kind distinguishes general chats
-- from triage chats, and issue_id links a triage chat to its source issue.
ALTER TABLE chat_session ADD COLUMN kind TEXT NOT NULL DEFAULT 'general'
    CHECK (kind IN ('general', 'triage'));
ALTER TABLE chat_session ADD COLUMN issue_id UUID REFERENCES issue(id) ON DELETE SET NULL;

CREATE INDEX idx_chat_session_issue ON chat_session(issue_id) WHERE issue_id IS NOT NULL;
