use chrono::NaiveDate;
use rusqlite::{Connection, OptionalExtension, Row, params};

use super::{accounts, add_months, categories, fmt_date, parse_date, positive, required};
use crate::error::{AppError, AppResult, validation};
use crate::models::{Cycle, Subscription, SubscriptionInput, SubscriptionStatus};

const SELECT: &str = "
    SELECT s.id, s.name, s.category_id, c.name, c.color, s.bucket, s.cycle, s.amount,
           s.renews_on, s.account_id, a.name, s.status
    FROM subscriptions s
    JOIN categories c ON c.id = s.category_id
    JOIN accounts a ON a.id = s.account_id";

/// Monthly equivalent in paise (SUB-02).
pub fn monthly_cost(amount: i64, cycle: Cycle) -> i64 {
    (amount as f64 / cycle.months() as f64).round() as i64
}

fn row(r: &Row) -> rusqlite::Result<Subscription> {
    let amount: i64 = r.get(7)?;
    let cycle: Cycle = r.get(6)?;
    let monthly = monthly_cost(amount, cycle);
    Ok(Subscription {
        id: r.get(0)?,
        name: r.get(1)?,
        category_id: r.get(2)?,
        category_name: r.get(3)?,
        category_color: r.get(4)?,
        bucket: r.get(5)?,
        cycle,
        amount,
        monthly_cost: monthly,
        yearly_cost: (amount as f64 * 12.0 / cycle.months() as f64).round() as i64,
        renews_on: r.get(8)?,
        account_id: r.get(9)?,
        account_name: r.get(10)?,
        status: r.get(11)?,
    })
}

pub fn list(conn: &Connection) -> AppResult<Vec<Subscription>> {
    let mut stmt = conn.prepare(&format!(
        "{SELECT} ORDER BY CASE s.status WHEN 'active' THEN 0 WHEN 'paused' THEN 1 ELSE 2 END, s.renews_on, s.name"
    ))?;
    let rows = stmt.query_map([], row)?;
    Ok(rows.collect::<Result<_, _>>()?)
}

pub fn get(conn: &Connection, id: i64) -> AppResult<Subscription> {
    conn.query_row(&format!("{SELECT} WHERE s.id = ?1"), [id], row)
        .optional()?
        .ok_or_else(|| AppError::NotFound("That subscription no longer exists.".into()))
}

/// Active subscriptions renewing between `today` and `today + days` (inclusive).
pub fn upcoming(conn: &Connection, today: NaiveDate, days: u64) -> AppResult<Vec<Subscription>> {
    let end = today + chrono::Days::new(days);
    let mut stmt = conn.prepare(&format!(
        "{SELECT} WHERE s.status = 'active' AND s.renews_on BETWEEN ?1 AND ?2 ORDER BY s.renews_on, s.name"
    ))?;
    let rows = stmt.query_map(params![fmt_date(today), fmt_date(end)], row)?;
    Ok(rows.collect::<Result<_, _>>()?)
}

fn validate(conn: &Connection, input: &SubscriptionInput) -> AppResult<(String, String)> {
    let name = required(&input.name, "Subscription name", 60)?;
    categories::get(conn, input.category_id)?;
    accounts::exists(conn, input.account_id)?;
    positive(input.amount, "Amount per cycle")?;
    let renews = fmt_date(parse_date(&input.renews_on, "Renews at")?);
    Ok((name, renews))
}

pub fn create(conn: &Connection, input: &SubscriptionInput) -> AppResult<Subscription> {
    let (name, renews) = validate(conn, input)?;
    conn.execute(
        "INSERT INTO subscriptions (name, category_id, bucket, cycle, amount, renews_on, account_id, status)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![name, input.category_id, input.bucket, input.cycle, input.amount, renews, input.account_id, input.status],
    )?;
    get(conn, conn.last_insert_rowid())
}

pub fn update(conn: &Connection, id: i64, input: &SubscriptionInput) -> AppResult<Subscription> {
    let (name, renews) = validate(conn, input)?;
    let n = conn.execute(
        "UPDATE subscriptions SET name = ?1, category_id = ?2, bucket = ?3, cycle = ?4, amount = ?5,
                renews_on = ?6, account_id = ?7, status = ?8 WHERE id = ?9",
        params![name, input.category_id, input.bucket, input.cycle, input.amount, renews, input.account_id, input.status, id],
    )?;
    if n == 0 {
        return Err(AppError::NotFound("That subscription no longer exists.".into()));
    }
    get(conn, id)
}

/// Past payments stay in Expenses (their link is cleared by the foreign key).
pub fn delete(conn: &Connection, id: i64) -> AppResult<()> {
    conn.execute("DELETE FROM subscriptions WHERE id = ?1", [id])?;
    Ok(())
}

/// Record a payment (SUB-05): logs an expense and moves the renewal one cycle on.
pub fn pay(conn: &mut Connection, id: i64, paid_on: NaiveDate) -> AppResult<Subscription> {
    let sub = get(conn, id)?;
    if sub.status != SubscriptionStatus::Active {
        return validation("Only active subscriptions can be paid. Set it to Active first.");
    }
    let current = parse_date(&sub.renews_on, "Renewal date")?;
    let next = add_months(current, sub.cycle.months());
    let tx = conn.transaction()?;
    tx.execute(
        "INSERT INTO expenses (description, category_id, account_id, bucket, date, amount, subscription_id)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![sub.name, sub.category_id, sub.account_id, sub.bucket, fmt_date(paid_on), sub.amount, sub.id],
    )?;
    tx.execute("UPDATE subscriptions SET renews_on = ?1 WHERE id = ?2", params![fmt_date(next), id])?;
    tx.commit()?;
    get(conn, id)
}
