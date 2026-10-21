-- Enable foreign keys
PRAGMA foreign_keys = ON;

-- 1. Accounts table
CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY NOT NULL,
    platform TEXT NOT NULL,
    name TEXT NOT NULL,
    encrypted_token TEXT NOT NULL,
    created_at INTEGER NOT NULL
);

-- 2. Posts table
CREATE TABLE IF NOT EXISTS posts (
    id TEXT PRIMARY KEY NOT NULL,
    content TEXT NOT NULL,
    media_urls TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL CHECK(status IN ('draft', 'scheduled', 'publishing', 'published', 'failed', 'partially_published')),
    scheduled_for INTEGER,
    created_at INTEGER NOT NULL
);

-- 3. Post destinations (Many-to-Many relation with cascade delete)
CREATE TABLE IF NOT EXISTS post_destinations (
    post_id TEXT NOT NULL,
    account_id TEXT NOT NULL,
    PRIMARY KEY (post_id, account_id),
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_post_destinations_post_id ON post_destinations(post_id);
CREATE INDEX IF NOT EXISTS idx_post_destinations_account_id ON post_destinations(account_id);
CREATE INDEX IF NOT EXISTS idx_accounts_platform ON accounts(platform);
CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status);
CREATE INDEX IF NOT EXISTS idx_posts_scheduled_for ON posts(scheduled_for);
