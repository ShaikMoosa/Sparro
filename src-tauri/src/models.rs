//! Data shapes shared with the UI. Every type here is exported to TypeScript
//! (`src/bindings`) by `cargo test`, so the frontend and backend cannot drift.
//! Money is always integer paise; dates are `YYYY-MM-DD` strings.

use rusqlite::types::{FromSql, FromSqlError, FromSqlResult, ToSql, ToSqlOutput, ValueRef};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// Enum stored as TEXT in SQLite and serialized with the same spelling.
macro_rules! text_enum {
    ($name:ident { $($variant:ident => $text:literal),+ $(,)? }) => {
        #[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
        #[ts(export)]
        pub enum $name { $( #[serde(rename = $text)] $variant ),+ }

        impl $name {
            pub fn as_str(self) -> &'static str { match self { $( $name::$variant => $text ),+ } }
            pub fn parse(s: &str) -> Option<Self> { match s { $( $text => Some($name::$variant), )+ _ => None } }
        }
        impl ToSql for $name {
            fn to_sql(&self) -> rusqlite::Result<ToSqlOutput<'_>> { Ok(ToSqlOutput::from(self.as_str())) }
        }
        impl FromSql for $name {
            fn column_result(v: ValueRef<'_>) -> FromSqlResult<Self> {
                let s = v.as_str()?;
                $name::parse(s).ok_or_else(|| FromSqlError::Other(format!("bad {} value: {s}", stringify!($name)).into()))
            }
        }
    };
}

text_enum!(Bucket { Needs => "needs", Wants => "wants", Savings => "savings" });
text_enum!(AccountKind { Savings => "savings", Current => "current", Cash => "cash", CreditCard => "credit_card" });
text_enum!(Cycle { Monthly => "monthly", Quarterly => "quarterly", Yearly => "yearly" });
text_enum!(SubscriptionStatus { Active => "active", Paused => "paused", Cancelled => "cancelled" });
text_enum!(Exchange { Nse => "NSE", Bse => "BSE" });

impl Cycle {
    pub fn months(self) -> u32 {
        match self {
            Cycle::Monthly => 1,
            Cycle::Quarterly => 3,
            Cycle::Yearly => 12,
        }
    }
}

// ---------- Accounts ----------

#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Account {
    pub id: i64,
    pub name: String,
    pub kind: AccountKind,
    pub opening_balance: i64,
    pub balance: i64,
    /// Expenses, income, transfers and subscriptions that reference this account.
    pub entry_count: i64,
}

#[derive(Debug, Clone, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct AccountInput {
    pub name: String,
    pub kind: AccountKind,
    pub opening_balance: i64,
}

// ---------- Categories ----------

#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Category {
    pub id: i64,
    pub name: String,
    pub bucket: Bucket,
    /// Palette key (`blue`, `purple`, …) or a `#rrggbb` custom colour.
    pub color: String,
    pub entry_count: i64,
}

#[derive(Debug, Clone, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct CategoryInput {
    pub name: String,
    pub bucket: Bucket,
    pub color: String,
}

// ---------- Expenses ----------

#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Expense {
    pub id: i64,
    pub description: String,
    pub category_id: i64,
    pub category_name: String,
    pub category_color: String,
    pub account_id: i64,
    pub account_name: String,
    pub bucket: Bucket,
    pub date: String,
    pub amount: i64,
    pub subscription_id: Option<i64>,
}

/// What the Subscriber toggle on the expense form asks for.
#[derive(Debug, Clone, Deserialize, TS)]
#[serde(tag = "kind", rename_all = "camelCase")]
#[ts(export)]
pub enum SubscriptionLink {
    /// Link to an existing subscription and move its renewal one cycle forward.
    #[serde(rename = "existing")]
    Existing { id: i64 },
    /// Create a new active subscription from this expense.
    #[serde(rename = "new")]
    New { cycle: Cycle },
}

#[derive(Debug, Clone, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ExpenseInput {
    pub description: String,
    pub category_id: i64,
    pub account_id: i64,
    pub bucket: Bucket,
    pub date: String,
    pub amount: i64,
    #[ts(optional)]
    pub subscription: Option<SubscriptionLink>,
}

#[derive(Debug, Clone, Default, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ExpenseFilter {
    /// `YYYY-MM`; ignored when `from`/`to` are given.
    #[ts(optional)]
    pub month: Option<String>,
    #[ts(optional)]
    pub search: Option<String>,
    #[ts(optional)]
    pub bucket: Option<Bucket>,
    #[ts(optional)]
    pub category_id: Option<i64>,
    #[ts(optional)]
    pub account_id: Option<i64>,
    #[ts(optional)]
    pub from: Option<String>,
    #[ts(optional)]
    pub to: Option<String>,
}

// ---------- Income & transfers ----------

#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Income {
    pub id: i64,
    pub name: String,
    pub account_id: i64,
    pub account_name: String,
    pub date: String,
    pub amount: i64,
}

#[derive(Debug, Clone, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct IncomeInput {
    pub name: String,
    pub account_id: i64,
    pub date: String,
    pub amount: i64,
}

#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Transfer {
    pub id: i64,
    pub from_account_id: i64,
    pub from_account_name: String,
    pub to_account_id: i64,
    pub to_account_name: String,
    pub date: String,
    pub amount: i64,
    pub note: String,
}

#[derive(Debug, Clone, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct TransferInput {
    pub from_account_id: i64,
    pub to_account_id: i64,
    pub date: String,
    pub amount: i64,
    pub note: String,
}

// ---------- Subscriptions ----------

#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Subscription {
    pub id: i64,
    pub name: String,
    pub category_id: i64,
    pub category_name: String,
    pub category_color: String,
    pub bucket: Bucket,
    pub cycle: Cycle,
    pub amount: i64,
    /// Monthly equivalent: monthly, quarterly ÷ 3, yearly ÷ 12.
    pub monthly_cost: i64,
    pub yearly_cost: i64,
    pub renews_on: String,
    pub account_id: i64,
    pub account_name: String,
    pub status: SubscriptionStatus,
}

#[derive(Debug, Clone, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct SubscriptionInput {
    pub name: String,
    pub category_id: i64,
    pub bucket: Bucket,
    pub cycle: Cycle,
    pub amount: i64,
    pub renews_on: String,
    pub account_id: i64,
    pub status: SubscriptionStatus,
}

// ---------- Investments ----------

#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Stock {
    pub id: i64,
    pub name: String,
    pub ticker: String,
    pub exchange: Exchange,
    pub units: f64,
    pub avg_price: i64,
    pub current_price: i64,
    pub purchase_date: String,
    pub invested: i64,
    pub current_value: i64,
    pub gain: i64,
}

#[derive(Debug, Clone, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct StockInput {
    pub name: String,
    pub ticker: String,
    pub exchange: Exchange,
    pub units: f64,
    pub avg_price: i64,
    pub current_price: i64,
    pub purchase_date: String,
}

#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Fund {
    pub id: i64,
    pub name: String,
    pub plan: String,
    pub units: f64,
    pub avg_nav: i64,
    pub current_nav: i64,
    pub sip_amount: i64,
    pub sip_day: i64,
    pub sip_start: String,
    pub invested: i64,
    pub current_value: i64,
    pub gain: i64,
}

#[derive(Debug, Clone, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct FundInput {
    pub name: String,
    pub plan: String,
    pub units: f64,
    pub avg_nav: i64,
    pub current_nav: i64,
    pub sip_amount: i64,
    pub sip_day: i64,
    pub sip_start: String,
}

#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Portfolio {
    pub invested: i64,
    pub current_value: i64,
    pub gain: i64,
    pub holdings: i64,
    pub stocks: Vec<Stock>,
    pub funds: Vec<Fund>,
    pub sip_monthly: i64,
    pub active_sips: i64,
    pub next_sip_date: Option<String>,
}

// ---------- Settings ----------

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Settings {
    pub needs_pct: i64,
    pub wants_pct: i64,
    pub savings_pct: i64,
    pub goal_amount: i64,
    /// Show a Windows notification before active subscriptions renew.
    pub reminders_enabled: bool,
    /// How many days before the renewal to notify (1–7).
    pub reminder_days: i64,
}

// ---------- Dashboard ----------

#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct BucketBudget {
    pub bucket: Bucket,
    pub spent: i64,
    /// `None` when no income is logged for the month.
    pub limit: Option<i64>,
    pub pct: i64,
}

#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Renewal {
    pub id: i64,
    pub name: String,
    pub date: String,
    pub days_left: i64,
    pub amount: i64,
}

#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct CategorySpend {
    pub category_id: i64,
    pub name: String,
    pub color: String,
    pub amount: i64,
}

#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Dashboard {
    pub month: String,
    pub goal_target: i64,
    pub goal_accounts: i64,
    pub goal_investments: i64,
    pub net_worth: i64,
    /// Change in net worth since the end of last month, as a percentage.
    pub net_worth_change_pct: Option<f64>,
    pub income: i64,
    pub buckets: Vec<BucketBudget>,
    pub renewals: Vec<Renewal>,
    pub renewals_total: i64,
    pub recent: Vec<Expense>,
    pub spend_total: i64,
    pub spend_by_category: Vec<CategorySpend>,
    pub has_accounts: bool,
}
