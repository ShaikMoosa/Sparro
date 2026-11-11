use chrono::NaiveDate;
use rusqlite::{Connection, params};

use super::{accounts, fmt_date, investments, ledger, month_bounds, settings, subscriptions};
use crate::error::AppResult;
use crate::models::*;

/// Everything the Dashboard shows for `month` (`YYYY-MM`), as of `today`.
pub fn build(conn: &Connection, month: &str, today: NaiveDate) -> AppResult<Dashboard> {
    let (first, last) = month_bounds(month)?;
    let s = settings::get(conn)?;

    // Net worth and goal (DSH-01, DSH-02)
    let account_total = accounts::total_balance(conn, None)?;
    let investments_total = investments::current_value(conn)?;
    let net_worth = account_total + investments_total;
    let prev_end = NaiveDate::parse_from_str(&first, "%Y-%m-%d").ok().and_then(|d| d.pred_opt());
    let net_worth_change_pct = match prev_end {
        Some(d) => {
            let prev = accounts::total_balance(conn, Some(&fmt_date(d)))? + investments_total;
            if prev > 0 { Some(((net_worth - prev) as f64 / prev as f64) * 100.0) } else { None }
        }
        None => None,
    };

    // Budget against limits (DSH-03): limits come from the month's logged income.
    let income = ledger::income_total(conn, month)?;
    let mut stmt = conn.prepare(
        "SELECT bucket, COALESCE(SUM(amount), 0) FROM expenses WHERE date BETWEEN ?1 AND ?2 GROUP BY bucket",
    )?;
    let spent: Vec<(Bucket, i64)> = stmt
        .query_map(params![first, last], |r| Ok((r.get(0)?, r.get(1)?)))?
        .collect::<Result<_, _>>()?;
    let spent_of = |b: Bucket| spent.iter().find(|(x, _)| *x == b).map(|(_, v)| *v).unwrap_or(0);
    let buckets = [(Bucket::Needs, s.needs_pct), (Bucket::Wants, s.wants_pct), (Bucket::Savings, s.savings_pct)]
        .into_iter()
        .map(|(bucket, pct)| {
            let spent = spent_of(bucket);
            let limit = if income > 0 { Some(income * pct / 100) } else { None };
            let used = match limit {
                Some(l) if l > 0 => ((spent as f64 / l as f64) * 100.0).round() as i64,
                _ => 0,
            };
            BucketBudget { bucket, spent, limit, pct: used }
        })
        .collect();

    // Renewals this week (DSH-05)
    let upcoming = subscriptions::upcoming(conn, today, 7)?;
    let renewals_total = upcoming.iter().map(|s| s.amount).sum();
    let renewals = upcoming
        .into_iter()
        .map(|s| {
            let d = NaiveDate::parse_from_str(&s.renews_on, "%Y-%m-%d").unwrap_or(today);
            Renewal { id: s.id, name: s.name, date: s.renews_on, days_left: (d - today).num_days(), amount: s.amount }
        })
        .collect();

    // Where it went (DSH-07)
    let mut stmt = conn.prepare(
        "SELECT c.id, c.name, c.color, SUM(e.amount) AS total
         FROM expenses e JOIN categories c ON c.id = e.category_id
         WHERE e.date BETWEEN ?1 AND ?2
         GROUP BY c.id ORDER BY total DESC, c.name",
    )?;
    let spend_by_category: Vec<CategorySpend> = stmt
        .query_map(params![first, last], |r| {
            Ok(CategorySpend { category_id: r.get(0)?, name: r.get(1)?, color: r.get(2)?, amount: r.get(3)? })
        })?
        .collect::<Result<_, _>>()?;
    let spend_total = spend_by_category.iter().map(|c| c.amount).sum();

    let has_accounts: bool = conn.query_row("SELECT EXISTS(SELECT 1 FROM accounts)", [], |r| r.get(0))?;

    Ok(Dashboard {
        month: month.to_string(),
        goal_target: s.goal_amount,
        goal_accounts: account_total,
        goal_investments: investments_total,
        net_worth,
        net_worth_change_pct,
        income,
        buckets,
        renewals,
        renewals_total,
        recent: ledger::recent_expenses(conn, 6)?,
        spend_total,
        spend_by_category,
        has_accounts,
    })
}
