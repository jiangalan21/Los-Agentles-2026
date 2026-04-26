const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

const statements = [
  'CREATE EXTENSION IF NOT EXISTS pgcrypto;',
  'ALTER TABLE users ADD COLUMN IF NOT EXISTS name TEXT;',
  'ALTER TABLE users ADD COLUMN IF NOT EXISTS location TEXT;',
  'ALTER TABLE users ADD COLUMN IF NOT EXISTS morning_focus TEXT;',
  'ALTER TABLE users ADD COLUMN IF NOT EXISTS routine_notes TEXT;',
  'ALTER TABLE users ADD COLUMN IF NOT EXISTS dietary_profile TEXT;',
  'ALTER TABLE users ADD COLUMN IF NOT EXISTS music_profile TEXT;',
  'ALTER TABLE users ADD COLUMN IF NOT EXISTS style_profile TEXT;',
  'CREATE TABLE IF NOT EXISTS plan_requests (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES users(id), status TEXT NOT NULL DEFAULT \'pending\', prompt TEXT, profile_json JSONB, started_at TIMESTAMPTZ, completed_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now());',
  'CREATE INDEX IF NOT EXISTS plan_requests_user_id_created_at_idx ON plan_requests(user_id, created_at);',
  'CREATE TABLE IF NOT EXISTS plan_request_agents (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), request_id UUID NOT NULL REFERENCES plan_requests(id), user_id UUID NOT NULL REFERENCES users(id), agent_name TEXT NOT NULL, status TEXT NOT NULL DEFAULT \'pending\', attempt_count INTEGER NOT NULL DEFAULT 0, last_error TEXT, completed_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now());',
  'CREATE UNIQUE INDEX IF NOT EXISTS plan_request_agents_request_id_agent_name_key ON plan_request_agents(request_id, agent_name);',
  'CREATE INDEX IF NOT EXISTS plan_request_agents_request_id_status_idx ON plan_request_agents(request_id, status);',
  'CREATE INDEX IF NOT EXISTS plan_request_agents_user_id_created_at_idx ON plan_request_agents(user_id, created_at);',
  'ALTER TABLE sessions ADD COLUMN IF NOT EXISTS request_id UUID REFERENCES plan_requests(id);',
  'CREATE INDEX IF NOT EXISTS sessions_request_id_idx ON sessions(request_id);',
  'ALTER TABLE agent_outputs ADD COLUMN IF NOT EXISTS request_id UUID REFERENCES plan_requests(id);',
  'CREATE INDEX IF NOT EXISTS agent_outputs_request_id_agent_name_created_at_idx ON agent_outputs(request_id, agent_name, created_at);',
  'ALTER TABLE feedback_events ADD COLUMN IF NOT EXISTS module_variant TEXT;',
  'ALTER TABLE feedback_events ADD COLUMN IF NOT EXISTS reason_code TEXT;',
  'ALTER TABLE feedback_events ADD COLUMN IF NOT EXISTS session_phase TEXT;',
  'ALTER TABLE feedback_events ADD COLUMN IF NOT EXISTS score INTEGER;',
  'CREATE INDEX IF NOT EXISTS feedback_events_user_id_agent_name_created_at_idx ON feedback_events(user_id, agent_name, created_at);',
]

async function main() {
  for (const statement of statements) {
    await prisma.$executeRawUnsafe(statement)
  }
  console.log('Request/profile schema delta applied successfully.')
}

main()
  .catch((error) => {
    console.error('Failed applying request/profile schema delta:', error.message)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
