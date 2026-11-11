//! Backup, restore and CSV export (SYS-04, SYS-05).

use std::fs;
use std::io::Write;
use std::path::Path;
use std::time::Duration;

use rusqlite::backup::Backup;
use rusqlite::{Connection, OpenFlags};

use super::ledger;
use crate::db;
use crate::error::{AppError, AppResult, validation};
use crate::models::{Bucket, ExpenseFilter};

/// Write a consistent copy of the whole database to `path` (overwriting it).
pub fn backup(conn: &Connection, path: &Path) -> AppResult<()> {
    if path.exists() {
        fs::remove_file(path).map_err(|e| AppError::Internal(format!("Couldn't replace the existing file: {e}")))?;
    }
    let target = path.to_str().ok_or_else(|| AppError::Validation("Choose a folder without unusual characters in its name.".into()))?;
    conn.execute("VACUUM INTO ?1", [target])?;
    Ok(())
}

/// Replace all current data with a backup file, after checking it is a Sparro backup.
pub fn restore(conn: &mut Connection, path: &Path) -> AppResult<()> {
    let src = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX)
        .map_err(|_| AppError::Validation("Sparro couldn't open that file.".into()))?;
    let tables: i64 = src
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table'
             AND name IN ('accounts', 'categories', 'expenses', 'incomes', 'settings')",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    if tables != 5 {
        return validation("That file isn't a Sparro backup.");
    }
    let version: i64 = src.pragma_query_value(None, "user_version", |r| r.get(0))?;
    if version as usize > db::MIGRATIONS.len() {
        return validation("This backup was made by a newer version of Sparro. Update Sparro, then restore it.");
    }
    {
        let backup = Backup::new(&src, conn)?;
        backup.run_to_completion(256, Duration::from_millis(0), None)?;
    }
    // Bring an older backup up to the current schema and fill any missing defaults.
    db::prepare(conn)
}

fn csv_field(s: &str) -> String {
    // Quote when needed; neutralise spreadsheet formulas (CSV injection).
    let s = if s.starts_with(['=', '+', '-', '@']) { format!("'{s}") } else { s.to_string() };
    if s.contains([',', '"', '\n', '\r']) { format!("\"{}\"", s.replace('"', "\"\"")) } else { s }
}

fn bucket_label(b: Bucket) -> &'static str {
    match b {
        Bucket::Needs => "Needs",
        Bucket::Wants => "Wants",
        Bucket::Savings => "Savings",
    }
}

/// Expenses matching `filter` as CSV text (Excel-friendly: BOM, CRLF, dd-mm-yyyy, plain numbers).
pub fn expenses_csv(conn: &Connection, filter: &ExpenseFilter) -> AppResult<(String, usize)> {
    let rows = ledger::list_expenses(conn, filter)?;
    let mut out = String::from("\u{feff}Date,Description,Category,Bucket,Account,Amount (INR)\r\n");
    for e in &rows {
        let date = format!("{}-{}-{}", &e.date[8..10], &e.date[5..7], &e.date[0..4]);
        let amount = format!("{}.{:02}", e.amount / 100, e.amount % 100);
        let line = [
            date,
            csv_field(&e.description),
            csv_field(&e.category_name),
            bucket_label(e.bucket).to_string(),
            csv_field(&e.account_name),
            amount,
        ]
        .join(",");
        out.push_str(&line);
        out.push_str("\r\n");
    }
    Ok((out, rows.len()))
}

pub fn export_expenses(conn: &Connection, filter: &ExpenseFilter, path: &Path) -> AppResult<usize> {
    let (csv, count) = expenses_csv(conn, filter)?;
    let mut f = fs::File::create(path).map_err(|e| AppError::Internal(format!("Couldn't save the file: {e}")))?;
    f.write_all(csv.as_bytes()).map_err(|e| AppError::Internal(format!("Couldn't save the file: {e}")))?;
    Ok(count)
}
