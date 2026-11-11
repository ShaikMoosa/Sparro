use rusqlite::{Connection, OptionalExtension, Row, params};

use super::required;
use crate::error::{AppError, AppResult, unique_or, validation};
use crate::models::{Account, AccountInput};

/// Balance = opening + income − expenses + transfers in − transfers out,
/// optionally only counting entries on or before `as_of`.
const BALANCE_SQL: &str = "
    a.opening_balance
    + COALESCE((SELECT SUM(amount) FROM incomes   WHERE account_id      = a.id AND (?1 IS NULL OR date <= ?1)), 0)
    - COALESCE((SELECT SUM(amount) FROM expenses  WHERE account_id      = a.id AND (?1 IS NULL OR date <= ?1)), 0)
    + COALESCE((SELECT SUM(amount) FROM transfers WHERE to_account_id   = a.id AND (?1 IS NULL OR date <= ?1)), 0)
    - COALESCE((SELECT SUM(amount) FROM transfers WHERE from_account_id = a.id AND (?1 IS NULL OR date <= ?1)), 0)";

const ENTRY_COUNT_SQL: &str = "
    (SELECT COUNT(*) FROM expenses WHERE account_id = a.id)
    + (SELECT COUNT(*) FROM incomes WHERE account_id = a.id)
    + (SELECT COUNT(*) FROM transfers WHERE from_account_id = a.id OR to_account_id = a.id)
    + (SELECT COUNT(*) FROM subscriptions WHERE account_id = a.id)";

fn row_to_account(r: &Row) -> rusqlite::Result<Account> {
    Ok(Account {
        id: r.get(0)?,
        name: r.get(1)?,
        kind: r.get(2)?,
        opening_balance: r.get(3)?,
        balance: r.get(4)?,
        entry_count: r.get(5)?,
    })
}

pub fn list(conn: &Connection) -> AppResult<Vec<Account>> {
    let sql = format!(
        "SELECT a.id, a.name, a.kind, a.opening_balance, {BALANCE_SQL}, {ENTRY_COUNT_SQL}
         FROM accounts a ORDER BY 5 DESC, a.name"
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(params![Option::<String>::None], row_to_account)?;
    Ok(rows.collect::<Result<_, _>>()?)
}

/// Sum of every account balance as of a date (inclusive), or now when `None`.
pub fn total_balance(conn: &Connection, as_of: Option<&str>) -> AppResult<i64> {
    let sql = format!("SELECT COALESCE(SUM({BALANCE_SQL}), 0) FROM accounts a");
    Ok(conn.query_row(&sql, params![as_of], |r| r.get(0))?)
}

pub fn get(conn: &Connection, id: i64) -> AppResult<Account> {
    let sql = format!(
        "SELECT a.id, a.name, a.kind, a.opening_balance, {BALANCE_SQL}, {ENTRY_COUNT_SQL}
         FROM accounts a WHERE a.id = ?2"
    );
    conn.query_row(&sql, params![Option::<String>::None, id], row_to_account)
        .optional()?
        .ok_or_else(|| AppError::NotFound("That account no longer exists.".into()))
}

pub fn exists(conn: &Connection, id: i64) -> AppResult<()> {
    let found: Option<i64> =
        conn.query_row("SELECT id FROM accounts WHERE id = ?1", [id], |r| r.get(0)).optional()?;
    found.map(|_| ()).ok_or_else(|| AppError::Validation("Choose an account.".into()))
}

pub fn create(conn: &Connection, input: &AccountInput) -> AppResult<Account> {
    let name = required(&input.name, "Account name", 60)?;
    conn.execute(
        "INSERT INTO accounts (name, kind, opening_balance) VALUES (?1, ?2, ?3)",
        params![name, input.kind, input.opening_balance],
    )
    .map_err(|e| unique_or(e, "An account with this name already exists."))?;
    get(conn, conn.last_insert_rowid())
}

pub fn update(conn: &Connection, id: i64, input: &AccountInput) -> AppResult<Account> {
    let name = required(&input.name, "Account name", 60)?;
    let n = conn
        .execute(
            "UPDATE accounts SET name = ?1, kind = ?2, opening_balance = ?3 WHERE id = ?4",
            params![name, input.kind, input.opening_balance, id],
        )
        .map_err(|e| unique_or(e, "An account with this name already exists."))?;
    if n == 0 {
        return Err(AppError::NotFound("That account no longer exists.".into()));
    }
    get(conn, id)
}

/// Delete an account (ACC-05). When it has entries, they must move to `move_to`.
/// Transfers that would end up between the same account are removed.
pub fn delete(conn: &mut Connection, id: i64, move_to: Option<i64>) -> AppResult<()> {
    let account = get(conn, id)?;
    let tx = conn.transaction()?;
    if account.entry_count > 0 {
        let Some(target) = move_to else {
            return validation("Choose an account to move this account's entries to.");
        };
        if target == id {
            return validation("Choose a different account to move entries to.");
        }
        exists(&tx, target)?;
        tx.execute(
            "DELETE FROM transfers WHERE (from_account_id = ?1 AND to_account_id = ?2) OR (from_account_id = ?2 AND to_account_id = ?1)",
            params![id, target],
        )?;
        tx.execute("UPDATE expenses SET account_id = ?2 WHERE account_id = ?1", params![id, target])?;
        tx.execute("UPDATE incomes SET account_id = ?2 WHERE account_id = ?1", params![id, target])?;
        tx.execute("UPDATE subscriptions SET account_id = ?2 WHERE account_id = ?1", params![id, target])?;
        tx.execute("UPDATE transfers SET from_account_id = ?2 WHERE from_account_id = ?1", params![id, target])?;
        tx.execute("UPDATE transfers SET to_account_id = ?2 WHERE to_account_id = ?1", params![id, target])?;
    }
    tx.execute("DELETE FROM accounts WHERE id = ?1", [id])?;
    tx.commit()?;
    Ok(())
}
