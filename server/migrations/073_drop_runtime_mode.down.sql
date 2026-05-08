ALTER TABLE agent ADD COLUMN IF NOT EXISTS runtime_mode TEXT NOT NULL DEFAULT 'cloud' CHECK (runtime_mode IN ('local', 'cloud'));
ALTER TABLE agent_runtime ADD COLUMN IF NOT EXISTS runtime_mode TEXT NOT NULL DEFAULT 'cloud' CHECK (runtime_mode IN ('local', 'cloud'));
