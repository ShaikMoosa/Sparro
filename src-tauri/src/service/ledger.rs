//! Expenses, income and transfers: everything that moves an account balance.

use rusqlite::{Connection, OptionalExtension, Row, Transaction, params, params_from_iter, types::Value};

use super::{accounts, add_months, categories, fmt_date, month_bounds, parse_date, positive, required};
use crate::error::{AppError, AppResult, validation};
use crate::models::*;

// ---------------- Expenses ----------------

const EXPENSE_SELECT: &str = "
    SELECT e.id, e.description, e.category_id, c.name, c.color, e.account_id, a.name,
           e.bucket, e.date, e.amount, e.subscription_id
    FROM expenses e
    JOIN categories c ON c.id = e.category_id
    JOIN accounts a ON a.id = e.account_id";

fn expense_row(r: &Row) -> rusqlite::Result<Expense> {
    Ok(Expense {
        id: r.get(0)?,
        description: r.get(1)?,
        category_id: r.get(2)?,
        category_name: r.get(3)?,
        category_color: r.get(4)?,
        account_id: r.get(5)?,
        account_name: r.get(6)?,
        bucket: r.get(7)?,
        date: r.get(8)?,
        amount: r.get(9)?,
        subscription_id: r.get(10)?,
    })
}

/// Newest first. Filters combine with AND (EXP-06).
pub fn list_expenses(conn: &Connection, f: &ExpenseFilter) -> AppResult<Vec<Expense>> {
    let mut clauses: Vec<String> = Vec::new();
    let mut args: Vec<Value> = Vec::new();
    let has_range = f.from.as_deref().is_some_and(|s| !s.is_empty()) || f.to.as_deref().is_some_and(|s| !s.is_empty());
    if let (Some(month), false) = (f.month.as_deref(), has_range) {
        let (first, last) = month_bounds(month)?;
        clauses.push("e.date BETWEEN ? AND ?".into());
        args.push(first.into());
        args.push(last.into());
    }
    if let Some(from) = f.from.as_deref().filter(|s| !s.is_empty()) {
        let d = parse_date(from, "From date")?;
        clauses.push("e.date >= ?".into());
        args.push(fmt_date(d).into());
    }
    if let Some(to) = f.to.as_deref().filter(|s| !s.is_empty()) {
        let d = parse_date(to, "To date")?;
        clauses.push("e.date <= ?".into());
        args.push(fmt_date(d).into());
    }
    if let (Some(from), Some(to)) = (f.from.as_deref(), f.to.as_deref()) {
        if !from.is_empty() && !to.is_empty() && from > to {
            return validation("From date must be on or before To date.");
        }
    }
    if let Some(s) = f.search.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        clauses.push("e.description LIKE ? ESCAPE '\\'".into());
        let escaped = s.replace('\\', "\\\\").replace('%', "\\%").replace('_', "\\_");
        args.push(format!("%{escaped}%").into());
    }
    if let Some(b) = f.bucket {
        clauses.push("e.bucket = ?".into());
        args.push(b.as_str().to_string().into());
    }
    if let Some(c) = f.category_id {
        clauses.push("e.category_id = ?".into());
        args.push(c.into());
    }
    if let Some(a) = f.account_id {
        clauses.push("e.account_id = ?".into());
        args.push(a.into());
    }
    let where_sql = if clauses.is_empty() { String::new() } else { format!(" WHERE {}", clauses.join(" AND ")) };
    let sql = format!("{EXPENSE_SELECT}{where_sql} ORDER BY e.date DESC, e.id DESC");
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(params_from_iter(args), expense_row)?;
    Ok(rows.collect::<Result<_, _>>()?)
}

pub fn recent_expenses(conn: &Connection, limit: i64) -> AppResult<Vec<Expense>> {
    let mut stmt = conn.prepare(&format!("{EXPENSE_SELECT} ORDER BY e.date DESC, e.id DESC LIMIT ?1"))?;
    let rows = stmt.query_map([limit], expense_row)?;
    Ok(rows.collect::<Result<_, _>>()?)
}

pub fn get_expense(conn: &Connection, id: i64) -> AppResult<Expense> {
    conn.query_row(&format!("{EXPENSE_SELECT} WHERE e.id = ?1"), [id], expense_row)
        .optional()?
        .ok_or_else(|| AppError::NotFound("That expense no longer exists.".into()))
}

struct CleanExpense {
    description: String,
    date: String,
}

fn validate_expense(conn: &Connection, input: &ExpenseInput) -> AppResult<CleanExpense> {
    let description = required(&input.description, "Description", 80)?;
    categories::get(conn, input.category_id)?;
    accounts::exists(conn, input.account_id)?;
    let date = fmt_date(parse_date(&input.date, "Date")?);
    positive(input.amount, "Amount")?;
    Ok(CleanExpense { description, date })
}

/// Apply the Subscriber toggle (EXP-04): link to an existing subscription and
/// roll its renewal forward, or create a new active one from this expense.
fn apply_subscription(tx: &Transaction, input: &ExpenseInput, clean: &CleanExpense) -> AppResult<Option<i64>> {
    match &input.subscription {
        None => Ok(None),
        Some(SubscriptionLink::Existing { id }) => {
            let row: Option<(String, Cycle)> = tx
                .query_row("SELECT renews_on, cycle FROM subscriptions WHERE id = ?1", [id], |r| {
                    Ok((r.get(0)?, r.get(1)?))
                })
                .optional()?;
            let Some((renews_on, cycle)) = row else {
                return validation("Choose a subscription.");
            };
            // This payment covers the current renewal, so the next one is a cycle later.
            let current = parse_date(&renews_on, "Renewal date")?;
            let next = add_months(current, cycle.months());
            tx.execute("UPDATE subscriptions SET renews_on = ?1 WHERE id = ?2", params![fmt_date(next), id])?;
            Ok(Some(*id))
        }
        Some(SubscriptionLink::New { cycle }) => {
            let paid_on = parse_date(&clean.date, "Date")?;
            let renews = add_months(paid_on, cycle.months());
            tx.execute(
                "INSERT INTO subscriptions (name, category_id, bucket, cycle, amount, renews_on, account_id, status)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'active')",
                params![
                    clean.description,
                    input.category_id,
                    input.bucket,
                    cycle,
                    input.amount,
                    fmt_date(renews),
                    input.account_id
                ],
            )?;
            Ok(Some(tx.last_insert_rowid()))
        }
    }
}

pub fn create_expense(conn: &mut Connection, input: &ExpenseInput) -> AppResult<Expense> {
    let clean = validate_expense(conn, input)?;
    let tx = conn.transaction()?;
    let sub_id = apply_subscription(&tx, input, &clean)?;
    tx.execute(
        "INSERT INTO expenses (description, category_id, account_id, bucket, date, amount, subscription_id)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![clean.description, input.category_id, input.account_id, input.bucket, clean.date, input.amount, sub_id],
    )?;
    let id = tx.last_insert_rowid();
    tx.commit()?;
    get_expense(conn, id)
}

/// Editing keeps an existing subscription link; it does not create or roll renewals.
pub fn update_expense(conn: &Connection, id: i64, input: &ExpenseInput) -> AppResult<Expense> {
    let clean = validate_expense(conn, input)?;
    let sub_id = match &input.subscription {
        Some(SubscriptionLink::Existing { id }) => Some(*id),
        _ => None,
    };
    let n = conn.execute(
        "UPDATE expenses SET description = ?1, category_id = ?2, account_id = ?3, bucket = ?4, date = ?5,
                amount = ?6, subscription_id = ?7 WHERE id = ?8",
        params![clean.description, input.category_id, input.account_id, input.bucket, clean.date, input.amount, sub_id, id],
    )?;
    if n == 0 {
        return Err(AppError::NotFound("That expense no longer exists.".into()));
    }
    get_expense(conn, id)
}

pub fn delete_expense(conn: &Connection, id: i64) -> AppResult<()> {
    conn.execute("DELETE FROM expenses WHERE id = ?1", [id])?;
    Ok(())
}

// ---------------- Income ----------------

const INCOME_SELECT: &str = "
    SELECT i.id, i.name, i.account_id, a.name, i.date, i.amount
    FROM incomes i JOIN accounts a ON a.id = i.account_id";

fn income_row(r: &Row) -> rusqlite::Result<Income> {
    Ok(Income {
        id: r.get(0)?,
        name: r.get(1)?,
        account_id: r.get(2)?,
        account_name: r.get(3)?,
        date: r.get(4)?,
        amount: r.get(5)?,
    })
}

pub fn list_incomes(conn: &Connection, month: &str) -> AppResult<Vec<Income>> {
    let (first, last) = month_bounds(month)?;
    let mut stmt = conn.prepare(&format!("{INCOME_SELECT} WHERE i.date BETWEEN ?1 AND ?2 ORDER BY i.date DESC, i.id DESC"))?;
    let rows = stmt.query_map(params![first, last], income_row)?;
    Ok(rows.collect::<Result<_, _>>()?)
}

pub fn income_total(conn: &Connection, month: &str) -> AppResult<i64> {
    let (first, last) = month_bounds(month)?;
    Ok(conn.query_row(
        "SELECT COALESCE(SUM(amount), 0) FROM incomes WHERE date BETWEEN ?1 AND ?2",
        params![first, last],
        |r| r.get(0),
    )?)
}

fn get_income(conn: &Connection, id: i64) -> AppResult<Income> {
    conn.query_row(&format!("{INCOME_SELECT} WHERE i.id = ?1"), [id], income_row)
        .optional()?
        .ok_or_else(|| AppError::NotFound("That income entry no longer exists.".into()))
}

fn validate_income(conn: &Connection, input: &IncomeInput) -> AppResult<(String, String)> {
    let name = required(&input.name, "Income name", 60)?;
    accounts::exists(conn, input.account_id)?;
    let date = fmt_date(parse_date(&input.date, "Date")?);
    positive(input.amount, "Amount")?;
    Ok((name, date))
}

pub fn create_income(conn: &Connection, input: &IncomeInput) -> AppResult<Income> {
    let (name, date) = validate_income(conn, input)?;
    conn.execute(
        "INSERT INTO incomes (name, account_id, date, amount) VALUES (?1, ?2, ?3, ?4)",
        params![name, input.account_id, date, input.amount],
    )?;
    get_income(conn, conn.last_insert_rowid())
}

pub fn update_income(conn: &Connection, id: i64, input: &IncomeInput) -> AppResult<Income> {
    let (name, date) = validate_income(conn, input)?;
    let n = conn.execute(
        "UPDATE incomes SET name = ?1, account_id = ?2, date = ?3, amount = ?4 WHERE id = ?5",
        params![name, input.account_id, date, input.amount, id],
    )?;
    if n == 0 {
        return Err(AppError::NotFound("That income entry no longer exists.".into()));
    }
    get_income(conn, id)
}

pub fn delete_income(conn: &Connection, id: i64) -> AppResult<()> {
    conn.execute("DELETE FROM incomes WHERE id = ?1", [id])?;
    Ok(())
}

// ---------------- Transfers ----------------

const TRANSFER_SELECT: &str = "
    SELECT t.id, t.from_account_id, fa.name, t.to_account_id, ta.name, t.date, t.amount, t.note
    FROM transfers t
    JOIN accounts fa ON fa.id = t.from_account_id
    JOIN accounts ta ON ta.id = t.to_account_id";

fn transfer_row(r: &Row) -> rusqlite::Result<Transfer> {
    Ok(Transfer {
        id: r.get(0)?,
        from_account_id: r.get(1)?,
        from_account_name: r.get(2)?,
        to_account_id: r.get(3)?,
        to_account_name: r.get(4)?,
        date: r.get(5)?,
        amount: r.get(6)?,
        note: r.get(7)?,
    })
}

pub fn list_transfers(conn: &Connection, month: &str) -> AppResult<Vec<Transfer>> {
    let (first, last) = month_bounds(month)?;
    let mut stmt =
        conn.prepare(&format!("{TRANSFER_SELECT} WHERE t.date BETWEEN ?1 AND ?2 ORDER BY t.date DESC, t.id DESC"))?;
    let rows = stmt.query_map(params![first, last], transfer_row)?;
    Ok(rows.collect::<Result<_, _>>()?)
}

fn get_transfer(conn: &Connection, id: i64) -> AppResult<Transfer> {
    conn.query_row(&format!("{TRANSFER_SELECT} WHERE t.id = ?1"), [id], transfer_row)
        .optional()?
        .ok_or_else(|| AppError::NotFound("That transfer no longer exists.".into()))
}

fn validate_transfer(conn: &Connection, input: &TransferInput) -> AppResult<(String, String)> {
    accounts::exists(conn, input.from_account_id)?;
    accounts::exists(conn, input.to_account_id)?;
    if input.from_account_id == input.to_account_id {
        return validation("From and To accounts must be different.");
    }
    let date = fmt_date(parse_date(&input.date, "Date")?);
    positive(input.amount, "Amount")?;
    let note = input.note.trim();
    if note.chars().count() > 80 {
        return validation("Note must be 80 characters or fewer.");
    }
    Ok((date, note.to_string()))
}

pub fn create_transfer(conn: &Connection, input: &TransferInput) -> AppResult<Transfer> {
    let (date, note) = validate_transfer(conn, input)?;
    conn.execute(
        "INSERT INTO transfers (from_account_id, to_account_id, date, amount, note) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![input.from_account_id, input.to_account_id, date, input.amount, note],
    )?;
    get_transfer(conn, conn.last_insert_rowid())
}

pub fn update_transfer(conn: &Connection, id: i64, input: &TransferInput) -> AppResult<Transfer> {
    let (date, note) = validate_transfer(conn, input)?;
    let n = conn.execute(
        "UPDATE transfers SET from_account_id = ?1, to_account_id = ?2, date = ?3, amount = ?4, note = ?5 WHERE id = ?6",
        params![input.from_account_id, input.to_account_id, date, input.amount, note, id],
    )?;
    if n == 0 {
        return Err(AppError::NotFound("That transfer no longer exists.".into()));
    }
    get_transfer(conn, id)
}

pub fn delete_transfer(conn: &Connection, id: i64) -> AppResult<()> {
    conn.execute("DELETE FROM transfers WHERE id = ?1", [id])?;
    Ok(())
}
