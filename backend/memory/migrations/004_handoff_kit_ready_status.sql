-- Migration 004: Handoff Kit Ready Status and Pipeline Indexes
-- Idempotent schema migration for fresh installs and populated copies.

CREATE TABLE IF NOT EXISTS career_applications (
    id                  SERIAL        PRIMARY KEY,
    user_id             TEXT          NOT NULL,
    opportunity_id      INTEGER       NOT NULL,
    resume_id           INTEGER,
    status              TEXT          NOT NULL DEFAULT 'SAVED',
    submission_method   TEXT          NOT NULL DEFAULT 'manual_handoff',
    form_answers        JSONB         NOT NULL DEFAULT '{}'::jsonb,
    submission_payload  JSONB         NOT NULL DEFAULT '{}'::jsonb,
    submission_result   JSONB         NOT NULL DEFAULT '{}'::jsonb,
    batch_id            TEXT,
    approved_at         TIMESTAMPTZ,
    submitted_at        TIMESTAMPTZ,
    target_deadline     DATE,
    private_notes       TEXT,
    cover_letter        TEXT,
    created_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),
    UNIQUE(user_id, opportunity_id)
);

CREATE INDEX IF NOT EXISTS idx_career_app_user ON career_applications(user_id);
CREATE INDEX IF NOT EXISTS idx_career_app_status ON career_applications(user_id, status);
CREATE INDEX IF NOT EXISTS idx_career_app_batch ON career_applications(batch_id);

CREATE TABLE IF NOT EXISTS application_events (
    id                  SERIAL        PRIMARY KEY,
    application_id      INTEGER       NOT NULL,
    event_type          TEXT          NOT NULL,
    details             JSONB         NOT NULL DEFAULT '{}'::jsonb,
    created_at          TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_app_events_app ON application_events(application_id);
