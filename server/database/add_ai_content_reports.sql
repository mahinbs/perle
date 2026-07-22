-- AI-generated content reports (Google Play AI content policy compliance)
-- Run in Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS ai_content_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_number BIGSERIAL UNIQUE,
  user_id UUID,
  user_email TEXT,
  conversation_id TEXT,
  message_id TEXT,
  user_prompt TEXT,
  ai_response TEXT NOT NULL,
  reason TEXT NOT NULL,
  description TEXT,
  model_used TEXT,
  chat_mode TEXT,
  device_info TEXT,
  app_version TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'reviewed', 'dismissed')),
  admin_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_content_reports_status ON ai_content_reports (status);
CREATE INDEX IF NOT EXISTS idx_ai_content_reports_created_at ON ai_content_reports (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_content_reports_user_id ON ai_content_reports (user_id);

ALTER TABLE ai_content_reports ENABLE ROW LEVEL SECURITY;

-- Service role (backend) manages all access; no direct client policies.
DROP POLICY IF EXISTS "Service role full access ai_content_reports" ON ai_content_reports;
CREATE POLICY "Service role full access ai_content_reports"
  ON ai_content_reports
  FOR ALL
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE ai_content_reports IS
  'In-app reports of harmful/offensive AI-generated content for moderation (Play Store AI policy).';
