use super::DbError;
use rusqlite::Connection;

const SCHEMA_VERSION: i32 = 3;

pub fn run_migrations(conn: &Connection) -> Result<(), DbError> {
    let current_version: i32 = conn
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .unwrap_or(0);

    if current_version < 1 {
        migrate_v1(conn)?;
    }
    if current_version < 2 {
        migrate_v2(conn)?;
    }
    if current_version < 3 {
        migrate_v3(conn)?;
    }

    conn.pragma_update(None, "user_version", SCHEMA_VERSION)
        .map_err(|e| DbError::SqliteError(e.to_string()))?;

    Ok(())
}

fn migrate_v1(conn: &Connection) -> Result<(), DbError> {
    conn.execute_batch(
        "
        -- Conversations
        CREATE TABLE IF NOT EXISTS conversations (
            id              TEXT PRIMARY KEY,
            type            INTEGER NOT NULL DEFAULT 0,
            target_id       TEXT NOT NULL,
            last_msg_id     TEXT,
            last_msg_time   INTEGER NOT NULL DEFAULT 0,
            last_msg_digest TEXT,
            unread_count    INTEGER NOT NULL DEFAULT 0,
            is_pinned       INTEGER NOT NULL DEFAULT 0,
            is_muted        INTEGER NOT NULL DEFAULT 0,
            draft           TEXT,
            updated_at      INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_conv_updated ON conversations(updated_at DESC);
        CREATE INDEX IF NOT EXISTS idx_conv_type ON conversations(type);

        -- Messages
        CREATE TABLE IF NOT EXISTS messages (
            id              TEXT PRIMARY KEY,
            custom_msg_id   TEXT UNIQUE,
            conversation_id TEXT NOT NULL,
            sender_id       TEXT NOT NULL,
            msg_type        INTEGER NOT NULL DEFAULT 0,
            content         TEXT,
            send_time       INTEGER NOT NULL DEFAULT 0,
            status          INTEGER NOT NULL DEFAULT 0,
            read_status     INTEGER NOT NULL DEFAULT 0,
            version         INTEGER NOT NULL DEFAULT 0,
            is_deleted      INTEGER NOT NULL DEFAULT 0,
            extra           TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_msg_conv_time ON messages(conversation_id, send_time DESC);
        CREATE INDEX IF NOT EXISTS idx_msg_sender ON messages(sender_id);
        CREATE INDEX IF NOT EXISTS idx_msg_type ON messages(msg_type);

        -- FTS5 for message search
        CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
            content,
            content=messages,
            content_rowid=rowid,
            tokenize='unicode61'
        );

        -- Contacts
        CREATE TABLE IF NOT EXISTS contacts (
            id              TEXT PRIMARY KEY,
            nickname        TEXT,
            avatar          TEXT,
            pinyin          TEXT,
            remark          TEXT,
            status          INTEGER NOT NULL DEFAULT 0,
            updated_at      INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_contact_pinyin ON contacts(pinyin);

        -- Groups
        CREATE TABLE IF NOT EXISTS groups (
            id              TEXT PRIMARY KEY,
            name            TEXT,
            avatar          TEXT,
            owner_id        TEXT,
            member_count    INTEGER NOT NULL DEFAULT 0,
            notice          TEXT,
            is_muted        INTEGER NOT NULL DEFAULT 0,
            updated_at      INTEGER NOT NULL DEFAULT 0
        );

        -- Group members
        CREATE TABLE IF NOT EXISTS group_members (
            group_id        TEXT NOT NULL,
            user_id         TEXT NOT NULL,
            nickname        TEXT,
            role            INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (group_id, user_id)
        );
        CREATE INDEX IF NOT EXISTS idx_gm_group ON group_members(group_id);

        -- Channels
        CREATE TABLE IF NOT EXISTS channels (
            id              TEXT PRIMARY KEY,
            name            TEXT,
            avatar          TEXT,
            owner_id        TEXT,
            description     TEXT,
            updated_at      INTEGER NOT NULL DEFAULT 0
        );

        -- Key pairs cache
        CREATE TABLE IF NOT EXISTS key_pairs (
            target_id       TEXT PRIMARY KEY,
            type            INTEGER NOT NULL DEFAULT 0,
            public_key      BLOB,
            private_key     BLOB,
            shared_key      BLOB,
            updated_at      INTEGER NOT NULL DEFAULT 0
        );

        -- File cache
        CREATE TABLE IF NOT EXISTS file_cache (
            msg_id          TEXT PRIMARY KEY,
            file_path       TEXT NOT NULL,
            file_size       INTEGER,
            mime_type       TEXT,
            created_at      INTEGER NOT NULL DEFAULT 0
        );

        -- Sync state
        CREATE TABLE IF NOT EXISTS sync_state (
            key             TEXT PRIMARY KEY,
            value           TEXT NOT NULL
        );

        -- Blacklist
        CREATE TABLE IF NOT EXISTS blacklist (
            uid             TEXT PRIMARY KEY,
            name            TEXT,
            added_at        INTEGER NOT NULL DEFAULT 0
        );

        -- Schedule deletion settings
        CREATE TABLE IF NOT EXISTS schedule_deletion (
            conversation_id TEXT PRIMARY KEY,
            seconds         INTEGER NOT NULL DEFAULT 0
        );
        ",
    )
    .map_err(|e| DbError::SqliteError(e.to_string()))?;

    Ok(())
}

fn migrate_v2(conn: &Connection) -> Result<(), DbError> {
    conn.execute_batch(
        "
        ALTER TABLE conversations ADD COLUMN is_archived INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE conversations ADD COLUMN sender_name TEXT;
        ALTER TABLE conversations ADD COLUMN at_me INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE conversations ADD COLUMN schedule_deletion INTEGER NOT NULL DEFAULT 0;
        ",
    )
    .map_err(|e| DbError::SqliteError(e.to_string()))?;
    Ok(())
}

fn migrate_v3(conn: &Connection) -> Result<(), DbError> {
    conn.execute_batch(
        "
        ALTER TABLE contacts ADD COLUMN letter TEXT;
        ALTER TABLE contacts ADD COLUMN depict TEXT;
        ALTER TABLE contacts ADD COLUMN identify TEXT;
        ",
    )
    .map_err(|e| DbError::SqliteError(e.to_string()))?;
    Ok(())
}
