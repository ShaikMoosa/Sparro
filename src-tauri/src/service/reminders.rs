//! Renewal reminders (SUB-09): which subscriptions need a Windows notification.

use chrono::NaiveDate;
use rusqlite::{Connection, params};

use super::{settings, subscriptions};
use crate::error::AppResult;
use crate::models::Subscription;

/// Active subscriptions renewing within the reminder window that haven't been notified yet.
pub fn due(conn: &Connection, today: NaiveDate) -> AppResult<Vec<Subscription>> {
    let s = settings::get(conn)?;
    if !s.reminders_enabled {
        return Ok(Vec::new());
    }
    let upcoming = subscriptions::upcoming(conn, today, s.reminder_days.clamp(1, 7) as u64)?;
    let mut stmt = conn.prepare("SELECT 1 FROM renewal_notices WHERE subscription_id = ?1 AND renews_on = ?2")?;
    let mut out = Vec::new();
    for sub in upcoming {
        if !stmt.exists(params![sub.id, sub.renews_on])? {
            out.push(sub);
        }
    }
    Ok(out)
}

pub fn mark_notified(conn: &Connection, subscription_id: i64, renews_on: &str) -> AppResult<()> {
    conn.execute(
        "INSERT OR IGNORE INTO renewal_notices (subscription_id, renews_on) VALUES (?1, ?2)",
        params![subscription_id, renews_on],
    )?;
    Ok(())
}

/// ₹ with Indian digit grouping, for notification text ("₹1,23,456" / "₹124.92").
pub fn inr(paise: i64) -> String {
    let rupees = paise.abs() / 100;
    let p = paise.abs() % 100;
    let digits = rupees.to_string();
    let grouped = if digits.len() <= 3 {
        digits
    } else {
        let (head, tail) = digits.split_at(digits.len() - 3);
        let mut parts: Vec<String> = Vec::new();
        let mut h = head.to_string();
        while h.len() > 2 {
            let cut = h.len() - 2;
            parts.insert(0, h[cut..].to_string());
            h.truncate(cut);
        }
        if !h.is_empty() {
            parts.insert(0, h);
        }
        format!("{},{}", parts.join(","), tail)
    };
    let sign = if paise < 0 { "−" } else { "" };
    if p == 0 { format!("{sign}₹{grouped}") } else { format!("{sign}₹{grouped}.{p:02}") }
}

/// Notification title and body for one renewal.
pub fn message(sub: &Subscription, today: NaiveDate) -> (String, String) {
    let date = NaiveDate::parse_from_str(&sub.renews_on, "%Y-%m-%d").unwrap_or(today);
    let days = (date - today).num_days();
    let when = match days {
        d if d <= 0 => "today".to_string(),
        1 => "tomorrow".to_string(),
        d => format!("in {d} days"),
    };
    let title = format!("{} renews {when}", sub.name);
    let body = format!(
        "{} will be paid from {} on {}. Open Sparro and choose Pay now to record it.",
        inr(sub.amount),
        sub.account_name,
        date.format("%a %-d %b")
    );
    (title, body)
}
