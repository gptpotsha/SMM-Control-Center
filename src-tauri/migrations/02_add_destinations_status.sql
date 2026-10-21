-- Migration 02: Add status and error_log to post_destinations table
ALTER TABLE post_destinations ADD COLUMN status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'published', 'failed'));
ALTER TABLE post_destinations ADD COLUMN error_log TEXT;
CREATE INDEX IF NOT EXISTS idx_post_destinations_status ON post_destinations(status);
