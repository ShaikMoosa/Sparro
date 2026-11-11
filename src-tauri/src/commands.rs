//! Tauri commands: thin wrappers that lock the database and call the service layer.

use std::sync::{Mutex, MutexGuard};

use chrono::NaiveDate;
use rusqlite::Connection;
use tauri::State;

use crate::error::AppResult;
use crate::models::*;
use crate::service::{accounts, categories, dashboard, data, investments, ledger, settings, subscriptions};

pub struct Db(pub Mutex<Connection>);

impl Db {
    pub(crate) fn lock(&self) -> MutexGuard<'_, Connection> {
        self.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
    }
}

pub(crate) fn today() -> NaiveDate {
    chrono::Local::now().date_naive()
}

// Accounts
#[tauri::command]
pub fn list_accounts(db: State<Db>) -> AppResult<Vec<Account>> {
    accounts::list(&db.lock())
}
#[tauri::command]
pub fn create_account(db: State<Db>, input: AccountInput) -> AppResult<Account> {
    accounts::create(&db.lock(), &input)
}
#[tauri::command]
pub fn update_account(db: State<Db>, id: i64, input: AccountInput) -> AppResult<Account> {
    accounts::update(&db.lock(), id, &input)
}
#[tauri::command]
pub fn delete_account(db: State<Db>, id: i64, move_to: Option<i64>) -> AppResult<()> {
    accounts::delete(&mut db.lock(), id, move_to)
}

// Categories
#[tauri::command]
pub fn list_categories(db: State<Db>) -> AppResult<Vec<Category>> {
    categories::list(&db.lock())
}
#[tauri::command]
pub fn create_category(db: State<Db>, input: CategoryInput) -> AppResult<Category> {
    categories::create(&db.lock(), &input)
}
#[tauri::command]
pub fn update_category(db: State<Db>, id: i64, input: CategoryInput) -> AppResult<Category> {
    categories::update(&mut db.lock(), id, &input)
}
#[tauri::command]
pub fn delete_category(db: State<Db>, id: i64, replacement: Option<i64>) -> AppResult<()> {
    categories::delete(&mut db.lock(), id, replacement)
}

// Expenses
#[tauri::command]
pub fn list_expenses(db: State<Db>, filter: ExpenseFilter) -> AppResult<Vec<Expense>> {
    ledger::list_expenses(&db.lock(), &filter)
}
#[tauri::command]
pub fn create_expense(db: State<Db>, input: ExpenseInput) -> AppResult<Expense> {
    ledger::create_expense(&mut db.lock(), &input)
}
#[tauri::command]
pub fn update_expense(db: State<Db>, id: i64, input: ExpenseInput) -> AppResult<Expense> {
    ledger::update_expense(&db.lock(), id, &input)
}
#[tauri::command]
pub fn delete_expense(db: State<Db>, id: i64) -> AppResult<()> {
    ledger::delete_expense(&db.lock(), id)
}

// Income
#[tauri::command]
pub fn list_incomes(db: State<Db>, month: String) -> AppResult<Vec<Income>> {
    ledger::list_incomes(&db.lock(), &month)
}
#[tauri::command]
pub fn create_income(db: State<Db>, input: IncomeInput) -> AppResult<Income> {
    ledger::create_income(&db.lock(), &input)
}
#[tauri::command]
pub fn update_income(db: State<Db>, id: i64, input: IncomeInput) -> AppResult<Income> {
    ledger::update_income(&db.lock(), id, &input)
}
#[tauri::command]
pub fn delete_income(db: State<Db>, id: i64) -> AppResult<()> {
    ledger::delete_income(&db.lock(), id)
}

// Transfers
#[tauri::command]
pub fn list_transfers(db: State<Db>, month: String) -> AppResult<Vec<Transfer>> {
    ledger::list_transfers(&db.lock(), &month)
}
#[tauri::command]
pub fn create_transfer(db: State<Db>, input: TransferInput) -> AppResult<Transfer> {
    ledger::create_transfer(&db.lock(), &input)
}
#[tauri::command]
pub fn update_transfer(db: State<Db>, id: i64, input: TransferInput) -> AppResult<Transfer> {
    ledger::update_transfer(&db.lock(), id, &input)
}
#[tauri::command]
pub fn delete_transfer(db: State<Db>, id: i64) -> AppResult<()> {
    ledger::delete_transfer(&db.lock(), id)
}

// Subscriptions
#[tauri::command]
pub fn list_subscriptions(db: State<Db>) -> AppResult<Vec<Subscription>> {
    subscriptions::list(&db.lock())
}
#[tauri::command]
pub fn create_subscription(db: State<Db>, input: SubscriptionInput) -> AppResult<Subscription> {
    subscriptions::create(&db.lock(), &input)
}
#[tauri::command]
pub fn update_subscription(db: State<Db>, id: i64, input: SubscriptionInput) -> AppResult<Subscription> {
    subscriptions::update(&db.lock(), id, &input)
}
#[tauri::command]
pub fn delete_subscription(db: State<Db>, id: i64) -> AppResult<()> {
    subscriptions::delete(&db.lock(), id)
}
#[tauri::command]
pub fn pay_subscription(db: State<Db>, id: i64) -> AppResult<Subscription> {
    subscriptions::pay(&mut db.lock(), id, today())
}

// Investments
#[tauri::command]
pub fn get_portfolio(db: State<Db>) -> AppResult<Portfolio> {
    investments::portfolio(&db.lock(), today())
}
#[tauri::command]
pub fn create_stock(db: State<Db>, input: StockInput) -> AppResult<Stock> {
    investments::create_stock(&db.lock(), &input, today())
}
#[tauri::command]
pub fn update_stock(db: State<Db>, id: i64, input: StockInput) -> AppResult<Stock> {
    investments::update_stock(&db.lock(), id, &input, today())
}
#[tauri::command]
pub fn delete_stock(db: State<Db>, id: i64) -> AppResult<()> {
    investments::delete_stock(&db.lock(), id)
}
#[tauri::command]
pub fn create_fund(db: State<Db>, input: FundInput) -> AppResult<Fund> {
    investments::create_fund(&db.lock(), &input)
}
#[tauri::command]
pub fn update_fund(db: State<Db>, id: i64, input: FundInput) -> AppResult<Fund> {
    investments::update_fund(&db.lock(), id, &input)
}
#[tauri::command]
pub fn delete_fund(db: State<Db>, id: i64) -> AppResult<()> {
    investments::delete_fund(&db.lock(), id)
}

// Settings & dashboard
#[tauri::command]
pub fn get_settings(db: State<Db>) -> AppResult<Settings> {
    settings::get(&db.lock())
}
#[tauri::command]
pub fn save_settings(db: State<Db>, input: Settings) -> AppResult<Settings> {
    settings::save(&mut db.lock(), &input)
}
#[tauri::command]
pub fn get_dashboard(db: State<Db>, month: String) -> AppResult<Dashboard> {
    dashboard::build(&db.lock(), &month, today())
}
#[tauri::command]
pub fn get_today() -> String {
    crate::service::fmt_date(today())
}

// Backup, restore & export (SYS-04, SYS-05)
#[tauri::command]
pub fn backup_database(db: State<Db>, path: String) -> AppResult<()> {
    data::backup(&db.lock(), std::path::Path::new(&path))
}
#[tauri::command]
pub fn restore_database(db: State<Db>, path: String) -> AppResult<()> {
    data::restore(&mut db.lock(), std::path::Path::new(&path))
}
#[tauri::command]
pub fn export_expenses(db: State<Db>, filter: ExpenseFilter, path: String) -> AppResult<usize> {
    data::export_expenses(&db.lock(), &filter, std::path::Path::new(&path))
}
