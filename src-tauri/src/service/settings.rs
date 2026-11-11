use rusqlite::{Connection, params};

use crate::error::{AppResult, validation};
use crate::models::Settings;

fn read(conn: &Connection, key: &str) -> AppResult<i64> {
    let v: String = conn.query_row("SELECT value FROM settings WHERE key = ?1", [key], |r| r.get(0))?;
    Ok(v.parse().unwrap_or(0))
}

pub fn get(conn: &Connection) -> AppResult<Settings> {
    Ok(Settings {
        needs_pct: read(conn, "needs_pct")?,
        wants_pct: read(conn, "wants_pct")?,
        savings_pct: read(conn, "savings_pct")?,
        goal_amount: read(conn, "goal_amount")?,
        reminders_enabled: read(conn, "reminders_enabled")? != 0,
        reminder_days: read(conn, "reminder_days")?,
    })
}

/// SET-01 / SET-04: percentages are whole numbers 0–100 adding up to 100.
pub fn save(conn: &mut Connection, s: &Settings) -> AppResult<Settings> {
    for (label, v) in [("Needs", s.needs_pct), ("Wants", s.wants_pct), ("Savings", s.savings_pct)] {
        if !(0..=100).contains(&v) {
            return validation(format!("{label} must be between 0% and 100%."));
        }
    }
    let total = s.needs_pct + s.wants_pct + s.savings_pct;
    if total != 100 {
        return validation(format!("Your percentages add up to {total}%. They must add up to 100%."));
    }
    if s.goal_amount <= 0 {
        return validation("Goal amount must be more than ₹0.");
    }
    if !(1..=7).contains(&s.reminder_days) {
        return validation("Remind me between 1 and 7 days before a renewal.");
    }
    let tx = conn.transaction()?;
    for (k, v) in [
        ("needs_pct", s.needs_pct),
        ("wants_pct", s.wants_pct),
        ("savings_pct", s.savings_pct),
        ("goal_amount", s.goal_amount),
        ("reminders_enabled", s.reminders_enabled as i64),
        ("reminder_days", s.reminder_days),
    ] {
        tx.execute(
            "INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![k, v.to_string()],
        )?;
    }
    tx.commit()?;
    get(conn)
}
