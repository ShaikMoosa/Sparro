//! Tests for backup / restore, CSV export and renewal reminders.

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

fn temp_path(name: &str) -> std::path::PathBuf {
    let dir = std::env::temp_dir().join(format!("sparro-test-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    dir.join(name)
}

fn account(c: &Connection, name: &str, kind: AccountKind, opening: i64) -> Account {
    accounts::create(c, &AccountInput { name: name.into(), kind, opening_balance: opening }).unwrap()
}

fn cat(c: &Connection, name: &str) -> Category {
    categories::list(c).unwrap().into_iter().find(|x| x.name == name).unwrap()
}

fn spend(c: &mut Connection, account_id: i64, category: &str, description: &str, date: &str, amount: i64) {
    let cat = cat(c, category);
    ledger::create_expense(
        c,
        &ExpenseInput {
            description: description.into(),
            category_id: cat.id,
            account_id,
            bucket: cat.bucket,
            date: date.into(),
            amount,
            subscription: None,
        },
    )
    .unwrap();
}

fn netflix(c: &Connection, account_id: i64, renews_on: &str, status: SubscriptionStatus) -> Subscription {
    let ent = cat(c, "Entertainment");
    subscriptions::create(
        c,
        &SubscriptionInput {
            name: "Netflix Premium".into(),
            category_id: ent.id,
            bucket: Bucket::Wants,
            cycle: Cycle::Monthly,
            amount: 649_00,
            renews_on: renews_on.into(),
            account_id,
            status,
        },
    )
    .unwrap()
}

#[test]
fn backup_and_restore_round_trip() {
    let mut c = conn();
    let a = account(&c, "HDFC Bank", AccountKind::Savings, 1_000_00);
    spend(&mut c, a.id, "Rent", "Rent", "2026-11-01", 500_00);
    let file = temp_path("backup.sparro");
    data::backup(&c, &file).unwrap();
    // Backing up to the same file again replaces it.
    data::backup(&c, &file).unwrap();

    // Change things after the backup, then restore.
    spend(&mut c, a.id, "Groceries", "Milk", "2026-11-02", 200_00);
    account(&c, "Cash in hand", AccountKind::Cash, 50_00);
    data::restore(&mut c, &file).unwrap();

    let accts = accounts::list(&c).unwrap();
    assert_eq!(accts.len(), 1);
    assert_eq!(accts[0].balance, 500_00);
    assert_eq!(ledger::list_expenses(&c, &ExpenseFilter::default()).unwrap().len(), 1);
    // Still fully usable after a restore.
    spend(&mut c, a.id, "Transport", "Auto fare", "2026-11-03", 10_00);
}

#[test]
fn restore_rejects_other_files() {
    let mut c = conn();
    let junk = temp_path("not-a-backup.sparro");
    std::fs::write(&junk, b"hello").unwrap();
    assert!(data::restore(&mut c, &junk).is_err());

    let other = temp_path("other.db");
    let _ = std::fs::remove_file(&other);
    Connection::open(&other).unwrap().execute_batch("CREATE TABLE notes (x TEXT);").unwrap();
    let err = data::restore(&mut c, &other).unwrap_err();
    assert!(err.to_string().contains("isn't a Sparro backup"));
    // The current data is untouched.
    assert_eq!(categories::list(&c).unwrap().len(), 15);
}

#[test]
fn csv_export_is_excel_friendly_and_escaped() {
    let mut c = conn();
    let a = account(&c, "HDFC Bank", AccountKind::Savings, 0);
    spend(&mut c, a.id, "Rent", r#"Rent, "November""#, "2026-11-01", 28_000_50);
    spend(&mut c, a.id, "Rent", "=HYPERLINK(1)", "2026-10-01", 1_00);

    let nov = ExpenseFilter { month: Some("2026-11".into()), ..Default::default() };
    let (csv, n) = data::expenses_csv(&c, &nov).unwrap();
    assert_eq!(n, 1);
    assert!(csv.starts_with("\u{feff}Date,Description,Category,Bucket,Account,Amount (INR)\r\n"));
    assert!(csv.contains("01-11-2026,\"Rent, \"\"November\"\"\",Rent,Needs,HDFC Bank,28000.50\r\n"), "{csv}");

    let (all, _) = data::expenses_csv(&c, &ExpenseFilter::default()).unwrap();
    assert!(all.contains("'=HYPERLINK(1)"), "spreadsheet formulas are neutralised");

    let file = temp_path("expenses.csv");
    assert_eq!(data::export_expenses(&c, &nov, &file).unwrap(), 1);
    assert_eq!(std::fs::read_to_string(&file).unwrap(), csv);
}

#[test]
fn reminders_fire_once_per_renewal() {
    let mut c = conn();
    let a = account(&c, "HDFC Bank", AccountKind::Savings, 0);
    let today = d("2026-11-11");
    let soon = netflix(&c, a.id, "2026-11-13", SubscriptionStatus::Active);
    netflix(&c, a.id, "2026-11-30", SubscriptionStatus::Active); // outside the 2-day window
    netflix(&c, a.id, "2026-11-12", SubscriptionStatus::Paused); // not active

    let due = reminders::due(&c, today).unwrap();
    assert_eq!(due.iter().map(|s| s.id).collect::<Vec<_>>(), vec![soon.id]);
    let (title, body) = reminders::message(&due[0], today);
    assert_eq!(title, "Netflix Premium renews in 2 days");
    assert!(body.starts_with("₹649 will be paid from HDFC Bank on Fri 13 Nov."), "{body}");

    reminders::mark_notified(&c, soon.id, &soon.renews_on).unwrap();
    assert!(reminders::due(&c, today).unwrap().is_empty());

    // After paying, the next renewal (a month later) gets its own reminder.
    subscriptions::pay(&mut c, soon.id, today).unwrap();
    assert!(reminders::due(&c, d("2026-12-12")).unwrap().iter().any(|s| s.id == soon.id));

    // Turning reminders off silences everything.
    let mut s = settings::get(&c).unwrap();
    s.reminders_enabled = false;
    settings::save(&mut c, &s).unwrap();
    assert!(reminders::due(&c, d("2026-12-12")).unwrap().is_empty());
}

#[test]
fn reminders_default_on_two_days() {
    let c = conn();
    let s = settings::get(&c).unwrap();
    assert!(s.reminders_enabled);
    assert_eq!(s.reminder_days, 2);
}

#[test]
fn inr_uses_indian_grouping() {
    assert_eq!(reminders::inr(649_00), "₹649");
    assert_eq!(reminders::inr(2_98_350_00), "₹2,98,350");
    assert_eq!(reminders::inr(1_23_45_678_00), "₹1,23,45,678");
    assert_eq!(reminders::inr(124_92), "₹124.92");
}
