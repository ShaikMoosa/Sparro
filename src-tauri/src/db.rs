use std::path::Path;

use rusqlite::{Connection, params};

use crate::error::AppResult;

/// Ordered schema migrations; `PRAGMA user_version` records how many have run.
const MIGRATIONS: &[&str] = &[include_str!("../migrations/001_init.sql")];

pub fn open(path: &Path) -> AppResult<Connection> {
    let mut conn = Connection::open(path)?;
    prepare(&mut conn)?;
    Ok(conn)
}

pub fn open_in_memory() -> AppResult<Connection> {
    let mut conn = Connection::open_in_memory()?;
    prepare(&mut conn)?;
    Ok(conn)
}

fn prepare(conn: &mut Connection) -> AppResult<()> {
    conn.pragma_update(None, "foreign_keys", "ON")?;
    conn.pragma_update(None, "journal_mode", "WAL")?;
    migrate(conn)?;
    seed(conn)?;
    Ok(())
}

fn migrate(conn: &mut Connection) -> AppResult<()> {
    let current: i64 = conn.pragma_query_value(None, "user_version", |r| r.get(0))?;
    for (i, sql) in MIGRATIONS.iter().enumerate().skip(current as usize) {
        let tx = conn.transaction()?;
        tx.execute_batch(sql)?;
        tx.pragma_update(None, "user_version", (i + 1) as i64)?;
        tx.commit()?;
    }
    Ok(())
}

/// Default categories (CAT-01) and budget settings (SET-02) on first launch.
const DEFAULT_CATEGORIES: &[(&str, &str, &str)] = &[
    ("Rent", "needs", "blue"),
    ("Groceries", "needs", "green"),
    ("Transport", "needs", "teal"),
    ("Utilities", "needs", "amber"),
    ("Healthcare", "needs", "pink"),
    ("EMI", "needs", "rose"),
    ("Dining out", "wants", "terracotta"),
    ("Shopping", "wants", "purple"),
    ("Entertainment", "wants", "pink"),
    ("Travel", "wants", "teal"),
    ("Subscriptions", "wants", "violet"),
    ("Emergency fund", "savings", "lime"),
    ("Investments", "savings", "green"),
    ("Retirement", "savings", "blue"),
    ("Goal savings", "savings", "amber"),
];

pub const DEFAULT_SETTINGS: &[(&str, &str)] = &[
    ("needs_pct", "50"),
    ("wants_pct", "30"),
    ("savings_pct", "20"),
    // ₹20,00,000 in paise
    ("goal_amount", "200000000"),
];

fn seed(conn: &Connection) -> AppResult<()> {
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM categories", [], |r| r.get(0))?;
    if count == 0 {
        let mut stmt =
            conn.prepare("INSERT INTO categories (name, bucket, color, position) VALUES (?1, ?2, ?3, ?4)")?;
        for (i, (name, bucket, color)) in DEFAULT_CATEGORIES.iter().enumerate() {
            stmt.execute(params![name, bucket, color, i as i64])?;
        }
    }
    for (k, v) in DEFAULT_SETTINGS {
        conn.execute("INSERT OR IGNORE INTO settings (key, value) VALUES (?1, ?2)", params![k, v])?;
    }
    Ok(())
}
