-- Migration 005: Chat Pending Actions and Soft Delete
-- Idempotent schema migration for safe task mutation and undo window.

-- 1. Add deleted_at to tasks for soft delete
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_deleted_at ON tasks(deleted_at);

-- 2. Chat Pending Actions Table
CREATE TABLE IF NOT EXISTS chat_pending_actions (
    id                  SERIAL        PRIMARY KEY,
    action              TEXT          NOT NULL,
    task_ids            INTEGER[]     NOT NULL DEFAULT '{}'::integer[],
    task_titles         JSONB         NOT NULL DEFAULT '[]'::jsonb,
    count               INTEGER       NOT NULL DEFAULT 1,
    owner_identity      TEXT          NOT NULL,
    conversation_id     TEXT          NOT NULL,
    status              TEXT          NOT NULL DEFAULT 'pending',
    created_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),
    expires_at          TIMESTAMPTZ   NOT NULL,
    executed_at         TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_chat_pending_owner_conv ON chat_pending_actions(owner_identity, conversation_id, status);
CREATE INDEX IF NOT EXISTS idx_chat_pending_expires ON chat_pending_actions(expires_at);

-- 3. Verifiable flag on messages
ALTER TABLE messages ADD COLUMN IF NOT EXISTS verifiable BOOLEAN DEFAULT FALSE;
