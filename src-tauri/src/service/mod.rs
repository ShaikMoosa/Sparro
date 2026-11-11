//! Business rules. Each function takes a `Connection` so it can be unit-tested
//! against an in-memory database; Tauri commands are thin wrappers around these.

pub mod accounts;
pub mod categories;
pub mod dashboard;
pub mod data;
pub mod investments;
pub mod ledger;
pub mod reminders;
pub mod settings;
pub mod subscriptions;

use chrono::{Datelike, Months, NaiveDate};

use crate::error::{AppResult, validation};

pub fn parse_date(s: &str, field: &str) -> AppResult<NaiveDate> {
    NaiveDate::parse_from_str(s.trim(), "%Y-%m-%d")
        .or_else(|_| validation(format!("{field} must be a real date.")))
}

pub fn fmt_date(d: NaiveDate) -> String {
    d.format("%Y-%m-%d").to_string()
}

pub fn required(value: &str, field: &str, max_len: usize) -> AppResult<String> {
    let v = value.trim();
    if v.is_empty() {
        return validation(format!("{field} is required."));
    }
    if v.chars().count() > max_len {
        return validation(format!("{field} must be {max_len} characters or fewer."));
    }
    Ok(v.to_string())
}

pub fn positive(amount: i64, field: &str) -> AppResult<i64> {
    if amount <= 0 {
        return validation(format!("{field} must be more than ₹0."));
    }
    Ok(amount)
}

/// Add calendar months, clamping to the month's last day (31 Jan + 1 → 28/29 Feb).
pub fn add_months(d: NaiveDate, months: u32) -> NaiveDate {
    d.checked_add_months(Months::new(months)).unwrap_or(d)
}

/// `YYYY-MM` → (first day, last day) as `YYYY-MM-DD` strings.
pub fn month_bounds(month: &str) -> AppResult<(String, String)> {
    let first = NaiveDate::parse_from_str(&format!("{}-01", month.trim()), "%Y-%m-%d")
        .or_else(|_| validation("Month must look like 2026-11."))?;
    let last = add_months(first, 1).pred_opt().unwrap_or(first);
    Ok((fmt_date(first), fmt_date(last)))
}

pub fn month_of(d: NaiveDate) -> String {
    format!("{:04}-{:02}", d.year(), d.month())
}

/// Integer paise from units × price, rounded to the nearest paisa.
pub fn value_of(units: f64, price: i64) -> i64 {
    (units * price as f64).round() as i64
}
