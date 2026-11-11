use chrono::{Datelike, NaiveDate};
use rusqlite::{Connection, OptionalExtension, Row, params};

use super::{add_months, fmt_date, parse_date, positive, required, value_of};
use crate::error::{AppError, AppResult, validation};
use crate::models::*;

fn stock_row(r: &Row) -> rusqlite::Result<Stock> {
    let units: f64 = r.get(4)?;
    let avg: i64 = r.get(5)?;
    let cur: i64 = r.get(6)?;
    let invested = value_of(units, avg);
    let current_value = value_of(units, cur);
    Ok(Stock {
        id: r.get(0)?,
        name: r.get(1)?,
        ticker: r.get(2)?,
        exchange: r.get(3)?,
        units,
        avg_price: avg,
        current_price: cur,
        purchase_date: r.get(7)?,
        invested,
        current_value,
        gain: current_value - invested,
    })
}

fn fund_row(r: &Row) -> rusqlite::Result<Fund> {
    let units: f64 = r.get(3)?;
    let avg: i64 = r.get(4)?;
    let cur: i64 = r.get(5)?;
    let invested = value_of(units, avg);
    let current_value = value_of(units, cur);
    Ok(Fund {
        id: r.get(0)?,
        name: r.get(1)?,
        plan: r.get(2)?,
        units,
        avg_nav: avg,
        current_nav: cur,
        sip_amount: r.get(6)?,
        sip_day: r.get(7)?,
        sip_start: r.get(8)?,
        invested,
        current_value,
        gain: current_value - invested,
    })
}

const STOCK_SELECT: &str =
    "SELECT id, name, ticker, exchange, units, avg_price, current_price, purchase_date FROM stocks";
const FUND_SELECT: &str =
    "SELECT id, name, plan, units, avg_nav, current_nav, sip_amount, sip_day, sip_start FROM funds";

pub fn stocks(conn: &Connection) -> AppResult<Vec<Stock>> {
    let mut stmt = conn.prepare(&format!("{STOCK_SELECT} ORDER BY (units * current_price) DESC, name"))?;
    let rows = stmt.query_map([], stock_row)?;
    Ok(rows.collect::<Result<_, _>>()?)
}

pub fn funds(conn: &Connection) -> AppResult<Vec<Fund>> {
    let mut stmt = conn.prepare(&format!("{FUND_SELECT} ORDER BY (units * current_nav) DESC, name"))?;
    let rows = stmt.query_map([], fund_row)?;
    Ok(rows.collect::<Result<_, _>>()?)
}

/// Next SIP instalment on or after `today` for a fund (INV-08).
pub fn next_sip(fund: &Fund, today: NaiveDate) -> Option<NaiveDate> {
    if fund.sip_amount <= 0 {
        return None;
    }
    let start = NaiveDate::parse_from_str(&fund.sip_start, "%Y-%m-%d").ok()?;
    let from = if start > today { start } else { today };
    let day = fund.sip_day.clamp(1, 28) as u32;
    let candidate = from.with_day(day)?;
    Some(if candidate >= from { candidate } else { add_months(candidate, 1) })
}

pub fn portfolio(conn: &Connection, today: NaiveDate) -> AppResult<Portfolio> {
    let stocks = stocks(conn)?;
    let funds = funds(conn)?;
    let invested: i64 = stocks.iter().map(|s| s.invested).sum::<i64>() + funds.iter().map(|f| f.invested).sum::<i64>();
    let current: i64 =
        stocks.iter().map(|s| s.current_value).sum::<i64>() + funds.iter().map(|f| f.current_value).sum::<i64>();
    let sips: Vec<&Fund> = funds.iter().filter(|f| f.sip_amount > 0).collect();
    let next = sips.iter().filter_map(|f| next_sip(f, today)).min();
    Ok(Portfolio {
        invested,
        current_value: current,
        gain: current - invested,
        holdings: (stocks.len() + funds.len()) as i64,
        sip_monthly: sips.iter().map(|f| f.sip_amount).sum(),
        active_sips: sips.len() as i64,
        next_sip_date: next.map(fmt_date),
        stocks,
        funds,
    })
}

pub fn current_value(conn: &Connection) -> AppResult<i64> {
    let s: f64 = conn.query_row("SELECT COALESCE(SUM(units * current_price), 0) FROM stocks", [], |r| r.get(0))?;
    let f: f64 = conn.query_row("SELECT COALESCE(SUM(units * current_nav), 0) FROM funds", [], |r| r.get(0))?;
    Ok((s + f).round() as i64)
}

fn validate_units(units: f64) -> AppResult<f64> {
    if !units.is_finite() || units <= 0.0 {
        return validation("Units must be more than 0.");
    }
    Ok(units)
}

fn validate_stock(input: &StockInput, today: NaiveDate) -> AppResult<(String, String, String)> {
    let name = required(&input.name, "Holding", 80)?;
    let ticker = required(&input.ticker, "Ticker", 20)?.to_uppercase();
    validate_units(input.units)?;
    positive(input.avg_price, "Average buy price")?;
    positive(input.current_price, "Current price")?;
    let d = parse_date(&input.purchase_date, "Purchase date")?;
    if d > today {
        return validation("Purchase date can't be in the future.");
    }
    Ok((name, ticker, fmt_date(d)))
}

pub fn create_stock(conn: &Connection, input: &StockInput, today: NaiveDate) -> AppResult<Stock> {
    let (name, ticker, date) = validate_stock(input, today)?;
    conn.execute(
        "INSERT INTO stocks (name, ticker, exchange, units, avg_price, current_price, purchase_date)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![name, ticker, input.exchange, input.units, input.avg_price, input.current_price, date],
    )?;
    get_stock(conn, conn.last_insert_rowid())
}

pub fn update_stock(conn: &Connection, id: i64, input: &StockInput, today: NaiveDate) -> AppResult<Stock> {
    let (name, ticker, date) = validate_stock(input, today)?;
    let n = conn.execute(
        "UPDATE stocks SET name = ?1, ticker = ?2, exchange = ?3, units = ?4, avg_price = ?5,
                current_price = ?6, purchase_date = ?7 WHERE id = ?8",
        params![name, ticker, input.exchange, input.units, input.avg_price, input.current_price, date, id],
    )?;
    if n == 0 {
        return Err(AppError::NotFound("That stock no longer exists.".into()));
    }
    get_stock(conn, id)
}

fn get_stock(conn: &Connection, id: i64) -> AppResult<Stock> {
    conn.query_row(&format!("{STOCK_SELECT} WHERE id = ?1"), [id], stock_row)
        .optional()?
        .ok_or_else(|| AppError::NotFound("That stock no longer exists.".into()))
}

pub fn delete_stock(conn: &Connection, id: i64) -> AppResult<()> {
    conn.execute("DELETE FROM stocks WHERE id = ?1", [id])?;
    Ok(())
}

fn validate_fund(input: &FundInput) -> AppResult<(String, String, String)> {
    let name = required(&input.name, "Fund name", 80)?;
    let plan = required(&input.plan, "Plan", 40)?;
    validate_units(input.units)?;
    positive(input.avg_nav, "Average buy NAV")?;
    positive(input.current_nav, "Current NAV")?;
    if input.sip_amount < 0 {
        return validation("Monthly SIP amount can't be negative.");
    }
    if !(1..=28).contains(&input.sip_day) {
        return validation("SIP day must be between 1 and 28.");
    }
    let start = fmt_date(parse_date(&input.sip_start, "SIP start date")?);
    Ok((name, plan, start))
}

pub fn create_fund(conn: &Connection, input: &FundInput) -> AppResult<Fund> {
    let (name, plan, start) = validate_fund(input)?;
    conn.execute(
        "INSERT INTO funds (name, plan, units, avg_nav, current_nav, sip_amount, sip_day, sip_start)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![name, plan, input.units, input.avg_nav, input.current_nav, input.sip_amount, input.sip_day, start],
    )?;
    get_fund(conn, conn.last_insert_rowid())
}

pub fn update_fund(conn: &Connection, id: i64, input: &FundInput) -> AppResult<Fund> {
    let (name, plan, start) = validate_fund(input)?;
    let n = conn.execute(
        "UPDATE funds SET name = ?1, plan = ?2, units = ?3, avg_nav = ?4, current_nav = ?5,
                sip_amount = ?6, sip_day = ?7, sip_start = ?8 WHERE id = ?9",
        params![name, plan, input.units, input.avg_nav, input.current_nav, input.sip_amount, input.sip_day, start, id],
    )?;
    if n == 0 {
        return Err(AppError::NotFound("That fund no longer exists.".into()));
    }
    get_fund(conn, id)
}

fn get_fund(conn: &Connection, id: i64) -> AppResult<Fund> {
    conn.query_row(&format!("{FUND_SELECT} WHERE id = ?1"), [id], fund_row)
        .optional()?
        .ok_or_else(|| AppError::NotFound("That fund no longer exists.".into()))
}

pub fn delete_fund(conn: &Connection, id: i64) -> AppResult<()> {
    conn.execute("DELETE FROM funds WHERE id = ?1", [id])?;
    Ok(())
}
