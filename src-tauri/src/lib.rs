mod commands;
pub mod db;
pub mod error;
pub mod models;
pub mod service;

#[cfg(test)]
mod tests;

use std::sync::Mutex;

use tauri::Manager;

use commands::*;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // %APPDATA%\com.sparro.app\sparro.db — data never leaves this PC (SYS-01).
            let dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&dir)?;
            let conn = db::open(&dir.join("sparro.db")).map_err(|e| e.to_string())?;
            app.manage(Db(Mutex::new(conn)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_accounts,
            create_account,
            update_account,
            delete_account,
            list_categories,
            create_category,
            update_category,
            delete_category,
            list_expenses,
            create_expense,
            update_expense,
            delete_expense,
            list_incomes,
            create_income,
            update_income,
            delete_income,
            list_transfers,
            create_transfer,
            update_transfer,
            delete_transfer,
            list_subscriptions,
            create_subscription,
            update_subscription,
            delete_subscription,
            pay_subscription,
            get_portfolio,
            create_stock,
            update_stock,
            delete_stock,
            create_fund,
            update_fund,
            delete_fund,
            get_settings,
            save_settings,
            get_dashboard,
            get_today,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Sparro");
}
