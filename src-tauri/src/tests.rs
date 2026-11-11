//! Service-layer tests against an in-memory database.

use chrono::NaiveDate;
use rusqlite::Connection;

use crate::db;
use crate::models::*;
use crate::service::*;

fn conn() -> Connection {
    db::open_in_memory().expect("db")
}

fn d(s: &str) -> NaiveDate {
    NaiveDate::parse_from_str(s, "%Y-%m-%d").unwrap()
}

fn account(c: &Connection, name: &str, kind: AccountKind, opening: i64) -> Account {
    accounts::create(c, &AccountInput { name: name.into(), kind, opening_balance: opening }).unwrap()
}

fn cat(c: &Connection, name: &str) -> Category {
    categories::list(c).unwrap().into_iter().find(|x| x.name == name).unwrap()
}

fn expense(c: &mut Connection, acc: i64, cat_name: &str, date: &str, amount: i64) -> Expense {
    let cat = cat(c, cat_name);
    ledger::create_expense(
        c,
        &ExpenseInput {
            description: "Test".into(),
            category_id: cat.id,
            account_id: acc,
            bucket: cat.bucket,
            date: date.into(),
            amount,
            subscription: None,
        },
    )
    .unwrap()
}

#[test]
fn seeds_defaults() {
    let c = conn();
    assert_eq!(categories::list(&c).unwrap().len(), 15);
    let s = settings::get(&c).unwrap();
    assert_eq!((s.needs_pct, s.wants_pct, s.savings_pct), (50, 30, 20));
    assert_eq!(s.goal_amount, 2_000_000_00);
}

#[test]
fn balances_follow_income_expenses_and_transfers() {
    let mut c = conn();
    let hdfc = account(&c, "HDFC Bank", AccountKind::Savings, 100_000_00);
    let cash = account(&c, "Cash in hand", AccountKind::Cash, 0);
    ledger::create_income(&c, &IncomeInput { name: "Salary".into(), account_id: hdfc.id, date: "2026-11-01".into(), amount: 50_000_00 }).unwrap();
    expense(&mut c, hdfc.id, "Rent", "2026-11-02", 28_000_00);
    ledger::create_transfer(&c, &TransferInput { from_account_id: hdfc.id, to_account_id: cash.id, date: "2026-11-03".into(), amount: 5_000_00, note: "ATM".into() }).unwrap();

    let list = accounts::list(&c).unwrap();
    let h = list.iter().find(|a| a.id == hdfc.id).unwrap();
    let k = list.iter().find(|a| a.id == cash.id).unwrap();
    assert_eq!(h.balance, 100_000_00 + 50_000_00 - 28_000_00 - 5_000_00);
    assert_eq!(k.balance, 5_000_00);
    // A transfer never changes the total (ACC-10).
    assert_eq!(accounts::total_balance(&c, None).unwrap(), 100_000_00 + 50_000_00 - 28_000_00);
}

#[test]
fn rejects_bad_input() {
    let c = conn();
    let a = account(&c, "HDFC Bank", AccountKind::Savings, 0);
    assert!(accounts::create(&c, &AccountInput { name: "hdfc bank".into(), kind: AccountKind::Current, opening_balance: 0 }).is_err());
    assert!(ledger::create_transfer(&c, &TransferInput { from_account_id: a.id, to_account_id: a.id, date: "2026-11-01".into(), amount: 1, note: String::new() }).is_err());
    assert!(ledger::create_income(&c, &IncomeInput { name: "Salary".into(), account_id: a.id, date: "2026-02-30".into(), amount: 1 }).is_err());
    assert!(ledger::create_income(&c, &IncomeInput { name: " ".into(), account_id: a.id, date: "2026-02-03".into(), amount: 1 }).is_err());
}

#[test]
fn budget_limits_come_from_logged_income() {
    let mut c = conn();
    let a = account(&c, "HDFC Bank", AccountKind::Savings, 0);
    expense(&mut c, a.id, "Rent", "2026-11-02", 10_000_00);
    let before = dashboard::build(&c, "2026-11", d("2026-11-11")).unwrap();
    assert!(before.buckets.iter().all(|b| b.limit.is_none()));

    ledger::create_income(&c, &IncomeInput { name: "Salary".into(), account_id: a.id, date: "2026-11-01".into(), amount: 40_000_00 }).unwrap();
    let after = dashboard::build(&c, "2026-11", d("2026-11-11")).unwrap();
    let needs = after.buckets.iter().find(|b| b.bucket == Bucket::Needs).unwrap();
    assert_eq!(needs.limit, Some(20_000_00));
    assert_eq!(needs.spent, 10_000_00);
    assert_eq!(needs.pct, 50);
}

#[test]
fn subscriber_toggle_creates_and_links_subscriptions() {
    let mut c = conn();
    let a = account(&c, "HDFC Bank", AccountKind::Savings, 0);
    let ent = cat(&c, "Entertainment");
    let input = ExpenseInput {
        description: "Netflix Premium".into(),
        category_id: ent.id,
        account_id: a.id,
        bucket: Bucket::Wants,
        date: "2026-11-18".into(),
        amount: 649_00,
        subscription: Some(SubscriptionLink::New { cycle: Cycle::Monthly }),
    };
    let e = ledger::create_expense(&mut c, &input).unwrap();
    let subs = subscriptions::list(&c).unwrap();
    assert_eq!(subs.len(), 1);
    assert_eq!(subs[0].renews_on, "2026-12-18");
    assert_eq!(e.subscription_id, Some(subs[0].id));

    let again = ExpenseInput { date: "2026-12-18".into(), subscription: Some(SubscriptionLink::Existing { id: subs[0].id }), ..input };
    ledger::create_expense(&mut c, &again).unwrap();
    assert_eq!(subscriptions::get(&c, subs[0].id).unwrap().renews_on, "2027-01-18");
}

#[test]
fn pay_now_logs_expense_and_rolls_renewal() {
    let mut c = conn();
    let a = account(&c, "HDFC Bank", AccountKind::Savings, 0);
    let ent = cat(&c, "Entertainment");
    let s = subscriptions::create(&c, &SubscriptionInput {
        name: "Amazon Prime".into(), category_id: ent.id, bucket: Bucket::Wants, cycle: Cycle::Yearly,
        amount: 1_499_00, renews_on: "2027-02-14".into(), account_id: a.id, status: SubscriptionStatus::Active,
    }).unwrap();
    assert_eq!(s.monthly_cost, 124_92);
    let paid = subscriptions::pay(&mut c, s.id, d("2026-11-11")).unwrap();
    assert_eq!(paid.renews_on, "2028-02-14");
    assert_eq!(accounts::get(&c, a.id).unwrap().balance, -1_499_00);
}

#[test]
fn deleting_category_moves_entries() {
    let mut c = conn();
    let a = account(&c, "HDFC Bank", AccountKind::Savings, 0);
    let shopping = cat(&c, "Shopping");
    let travel = cat(&c, "Travel");
    expense(&mut c, a.id, "Shopping", "2026-11-04", 1_270_00);
    assert!(categories::delete(&mut c, shopping.id, None).is_err());
    categories::delete(&mut c, shopping.id, Some(travel.id)).unwrap();
    let all = ledger::list_expenses(&c, &ExpenseFilter::default()).unwrap();
    assert_eq!(all[0].category_id, travel.id);
    assert_eq!(all[0].amount, 1_270_00);
}

#[test]
fn deleting_account_moves_entries_and_drops_self_transfers() {
    let mut c = conn();
    let hdfc = account(&c, "HDFC Bank", AccountKind::Savings, 0);
    let icici = account(&c, "ICICI Bank", AccountKind::Current, 0);
    expense(&mut c, icici.id, "EMI", "2026-11-05", 14_500_00);
    ledger::create_transfer(&c, &TransferInput { from_account_id: icici.id, to_account_id: hdfc.id, date: "2026-11-08".into(), amount: 20_000_00, note: String::new() }).unwrap();
    assert!(accounts::delete(&mut c, icici.id, None).is_err());
    accounts::delete(&mut c, icici.id, Some(hdfc.id)).unwrap();
    assert_eq!(ledger::list_transfers(&c, "2026-11").unwrap().len(), 0);
    assert_eq!(ledger::list_expenses(&c, &ExpenseFilter::default()).unwrap()[0].account_id, hdfc.id);
}

#[test]
fn expense_filters_combine() {
    let mut c = conn();
    let a = account(&c, "HDFC Bank", AccountKind::Savings, 0);
    expense(&mut c, a.id, "Rent", "2026-11-01", 28_000_00);
    expense(&mut c, a.id, "Shopping", "2026-11-04", 1_270_00);
    expense(&mut c, a.id, "Shopping", "2026-10-04", 999_00);
    let nov = ExpenseFilter { month: Some("2026-11".into()), ..Default::default() };
    assert_eq!(ledger::list_expenses(&c, &nov).unwrap().len(), 2);
    let wants = ExpenseFilter { bucket: Some(Bucket::Wants), ..nov.clone() };
    assert_eq!(ledger::list_expenses(&c, &wants).unwrap().len(), 1);
    let bad = ExpenseFilter { from: Some("2026-11-05".into()), to: Some("2026-11-01".into()), ..Default::default() };
    assert!(ledger::list_expenses(&c, &bad).is_err());
}

#[test]
fn settings_must_total_100() {
    let mut c = conn();
    let bad = Settings { needs_pct: 50, wants_pct: 30, savings_pct: 30, goal_amount: 1 };
    assert!(settings::save(&mut c, &bad).is_err());
    let ok = Settings { needs_pct: 60, wants_pct: 20, savings_pct: 20, goal_amount: 1_00 };
    assert_eq!(settings::save(&mut c, &ok).unwrap().needs_pct, 60);
}

#[test]
fn portfolio_values_and_next_sip() {
    let c = conn();
    investments::create_stock(&c, &StockInput { name: "Reliance Industries".into(), ticker: "reliance".into(), exchange: Exchange::Nse, units: 100.0, avg_price: 2_450_00, current_price: 2_680_00, purchase_date: "2025-01-10".into() }, d("2026-11-11")).unwrap();
    investments::create_fund(&c, &FundInput { name: "HDFC Flexi Cap Fund".into(), plan: "Direct · Growth".into(), units: 2000.0, avg_nav: 80_00, current_nav: 92_00, sip_amount: 5_000_00, sip_day: 5, sip_start: "2025-01-05".into() }).unwrap();
    let p = investments::portfolio(&c, d("2026-11-11")).unwrap();
    assert_eq!(p.stocks[0].ticker, "RELIANCE");
    assert_eq!(p.stocks[0].gain, 23_000_00);
    assert_eq!(p.invested, 2_45_000_00 + 1_60_000_00);
    assert_eq!(p.next_sip_date.as_deref(), Some("2026-12-05"));
    assert!(investments::create_stock(&c, &StockInput { name: "X".into(), ticker: "X".into(), exchange: Exchange::Bse, units: 1.0, avg_price: 1, current_price: 1, purchase_date: "2027-01-01".into() }, d("2026-11-11")).is_err());
}
