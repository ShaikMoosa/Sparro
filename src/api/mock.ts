/**
 * In-memory stand-in for the Rust backend, used only by `npm run dev` in a browser
 * and by component tests. It mirrors the service rules closely enough to review
 * screens; the Rust code (with its own tests) is the source of truth.
 */
import type { Account } from "../bindings/Account";
import type { AccountKind } from "../bindings/AccountKind";
import type { Bucket } from "../bindings/Bucket";
import type { Category } from "../bindings/Category";
import type { Cycle } from "../bindings/Cycle";
import type { Dashboard } from "../bindings/Dashboard";
import type { Expense } from "../bindings/Expense";
import type { ExpenseFilter } from "../bindings/ExpenseFilter";
import type { ExpenseInput } from "../bindings/ExpenseInput";
import type { Fund } from "../bindings/Fund";
import type { Income } from "../bindings/Income";
import type { Settings } from "../bindings/Settings";
import type { Stock } from "../bindings/Stock";
import type { Subscription } from "../bindings/Subscription";
import type { SubscriptionStatus } from "../bindings/SubscriptionStatus";
import type { Transfer } from "../bindings/Transfer";
import { addMonthsISO, currentMonth, daysBetween, todayISO } from "../lib/format";
import type { ApiError } from "./client";

type Row<T> = T & { id: number };
type AccountRow = { id: number; name: string; kind: AccountKind; openingBalance: number };
type CategoryRow = { id: number; name: string; bucket: Bucket; color: string };
type ExpenseRow = Omit<Expense, "categoryName" | "categoryColor" | "accountName">;
type IncomeRow = Omit<Income, "accountName">;
type TransferRow = Omit<Transfer, "fromAccountName" | "toAccountName">;
type SubRow = { id: number; name: string; categoryId: number; bucket: Bucket; cycle: Cycle; amount: number; renewsOn: string; accountId: number; status: SubscriptionStatus };
type StockRow = Omit<Stock, "invested" | "currentValue" | "gain">;
type FundRow = Omit<Fund, "invested" | "currentValue" | "gain">;

const months: Record<Cycle, number> = { monthly: 1, quarterly: 3, yearly: 12 };
let nextId = 1000;
const id = () => ++nextId;

const fail = (message: string, kind: ApiError["kind"] = "validation"): never => {
  throw { kind, message } satisfies ApiError;
};

function seed() {
  const m = currentMonth();
  const day = (d: number) => `${m}-${String(d).padStart(2, "0")}`;
  const today = todayISO();
  const inDays = (n: number) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const categories: CategoryRow[] = [
    ["Rent", "needs", "blue"], ["Groceries", "needs", "green"], ["Transport", "needs", "teal"], ["Utilities", "needs", "amber"],
    ["Healthcare", "needs", "pink"], ["EMI", "needs", "rose"], ["Dining out", "wants", "terracotta"], ["Shopping", "wants", "purple"],
    ["Entertainment", "wants", "pink"], ["Travel", "wants", "teal"], ["Subscriptions", "wants", "violet"], ["Emergency fund", "savings", "lime"],
    ["Investments", "savings", "green"], ["Retirement", "savings", "blue"], ["Goal savings", "savings", "amber"],
  ].map(([name, bucket, color], i) => ({ id: i + 1, name, bucket: bucket as Bucket, color }));
  const cat = (name: string) => categories.find((c) => c.name === name)!;
  const accounts: AccountRow[] = [
    { id: 1, name: "HDFC Bank", kind: "savings", openingBalance: 1_69_090_00 },
    { id: 2, name: "ICICI Bank", kind: "current", openingBalance: 61_050_00 },
    { id: 3, name: "Cash in hand", kind: "cash", openingBalance: 2_870_00 },
    { id: 4, name: "SBI", kind: "savings", openingBalance: 30_000_00 },
    { id: 5, name: "Kotak Bank", kind: "savings", openingBalance: 12_000_00 },
  ];
  const e = (description: string, c: string, accountId: number, d: number, amount: number): ExpenseRow => ({
    id: id(), description, categoryId: cat(c).id, accountId, bucket: cat(c).bucket, date: day(d), amount, subscriptionId: null,
  });
  const expenses: ExpenseRow[] = [
    e("Home loan EMI", "EMI", 2, 5, 14_500_00), e("Auto fare", "Transport", 3, 5, 140_00), e("Decathlon", "Shopping", 2, 4, 1_270_00),
    e("Emergency fund top-up", "Emergency fund", 4, 4, 5_000_00), e("Dinner with friends", "Dining out", 1, 3, 460_00),
    e("Gaming top-up", "Entertainment", 1, 3, 690_00), e("Monthly SIP", "Investments", 1, 3, 15_000_00), e("LPG cylinder", "Utilities", 3, 2, 1_150_00),
    e("Milk and staples", "Groceries", 3, 2, 990_00), e("Metro card top-up", "Transport", 1, 2, 490_00), e("Monthly rent", "Rent", 1, 1, 28_000_00),
    e("Milk and staples", "Groceries", 1, 1, 1_360_00),
  ];
  const incomes: IncomeRow[] = [
    { id: id(), name: "Salary", accountId: 2, date: day(5), amount: 1_15_000_00 },
    { id: id(), name: "Freelance", accountId: 3, date: day(5), amount: 100_00 },
  ];
  const transfers: TransferRow[] = [
    { id: id(), fromAccountId: 1, toAccountId: 3, date: day(Math.min(12, Number(today.slice(8)))), amount: 5_000_00, note: "ATM withdrawal" },
    { id: id(), fromAccountId: 2, toAccountId: 1, date: day(8 > Number(today.slice(8)) ? 1 : 8), amount: 20_000_00, note: "Move for rent" },
  ];
  const ent = cat("Entertainment").id;
  const subs: SubRow[] = [
    { id: id(), name: "Netflix Premium", categoryId: ent, bucket: "wants", cycle: "monthly", amount: 649_00, renewsOn: inDays(2), accountId: 1, status: "active" },
    { id: id(), name: "Jio AirFiber", categoryId: cat("Utilities").id, bucket: "needs", cycle: "monthly", amount: 999_00, renewsOn: inDays(4), accountId: 1, status: "active" },
    { id: id(), name: "Amazon Prime", categoryId: ent, bucket: "wants", cycle: "yearly", amount: 1_499_00, renewsOn: inDays(5), accountId: 2, status: "active" },
    { id: id(), name: "Spotify Premium", categoryId: ent, bucket: "wants", cycle: "monthly", amount: 119_00, renewsOn: inDays(6), accountId: 1, status: "active" },
    { id: id(), name: "Adobe Creative Cloud", categoryId: cat("Subscriptions").id, bucket: "needs", cycle: "quarterly", amount: 2_397_00, renewsOn: inDays(62), accountId: 1, status: "active" },
    { id: id(), name: "YouTube Premium", categoryId: ent, bucket: "wants", cycle: "monthly", amount: 129_00, renewsOn: inDays(7), accountId: 1, status: "paused" },
    { id: id(), name: "Notion Plus", categoryId: cat("Subscriptions").id, bucket: "wants", cycle: "yearly", amount: 9_600_00, renewsOn: inDays(90), accountId: 1, status: "cancelled" },
  ];
  const stocks: StockRow[] = [
    ["Reliance Industries", "RELIANCE", 100, 2_450_00, 2_680_00], ["Tata Consultancy Services", "TCS", 40, 3_400_00, 3_725_00],
    ["Infosys", "INFY", 80, 1_500_00, 1_440_00], ["HDFC Bank", "HDFCBANK", 60, 1_600_00, 1_720_00], ["ITC", "ITC", 200, 420_00, 455_00],
    ["Tata Motors", "TATAMOTORS", 100, 800_00, 860_00],
  ].map(([name, ticker, u, avg, cur]) => ({
    id: id(), name: name as string, ticker: ticker as string, exchange: "NSE", units: u as number, avgPrice: avg as number, currentPrice: cur as number, purchaseDate: "2025-04-10",
  }));
  const funds: FundRow[] = [
    { id: id(), name: "HDFC Flexi Cap Fund", plan: "Direct · Growth", units: 2000, avgNav: 80_00, currentNav: 92_00, sipAmount: 5_000_00, sipDay: 5, sipStart: "2025-01-05" },
    { id: id(), name: "UTI Nifty 50 Index Fund", plan: "Direct · Growth", units: 1000, avgNav: 120_00, currentNav: 132_00, sipAmount: 4_000_00, sipDay: 5, sipStart: "2025-01-05" },
    { id: id(), name: "Parag Parikh Flexi Cap Fund", plan: "Direct · Growth", units: 2000, avgNav: 50_00, currentNav: 55_00, sipAmount: 3_000_00, sipDay: 5, sipStart: "2025-01-05" },
  ];
  const settings: Settings = { needsPct: 50, wantsPct: 30, savingsPct: 20, goalAmount: 20_00_000_00, remindersEnabled: true, reminderDays: 2 };
  return { categories, accounts, expenses, incomes, transfers, subs, stocks, funds, settings };
}

let db = seed();

/** Test helper: reset (optionally to an empty, first-run database). */
export function resetMock(empty = false) {
  db = seed();
  if (empty) {
    db.accounts = []; db.expenses = []; db.incomes = []; db.transfers = []; db.subs = []; db.stocks = []; db.funds = [];
  }
}

// ---------- helpers ----------
const req = (v: string, field: string, max = 80) => {
  const t = (v ?? "").trim();
  if (!t) fail(`${field} is required.`);
  if (t.length > max) fail(`${field} must be ${max} characters or fewer.`);
  return t;
};
const pos = (n: number, field: string) => (n > 0 ? n : fail(`${field} must be more than ₹0.`));
const date = (s: string, field: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s ?? "")) fail(`${field} must be a real date.`);
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  if (dt.getMonth() !== m - 1 || dt.getDate() !== d) fail(`${field} must be a real date.`);
  return s;
};
const acc = (aid: number) => db.accounts.find((a) => a.id === aid) ?? fail("Choose an account.");
const cat = (cid: number) => db.categories.find((c) => c.id === cid) ?? fail("Choose a category.");
const inMonth = (d: string, m: string) => d.startsWith(m);
const uniq = (list: { id: number; name: string }[], name: string, self: number | null, msg: string) => {
  if (list.some((x) => x.id !== self && x.name.toLowerCase() === name.toLowerCase())) fail(msg, "conflict");
};

function balance(a: AccountRow, asOf?: string) {
  const ok = (d: string) => !asOf || d <= asOf;
  return (
    a.openingBalance +
    db.incomes.filter((i) => i.accountId === a.id && ok(i.date)).reduce((s, i) => s + i.amount, 0) -
    db.expenses.filter((e) => e.accountId === a.id && ok(e.date)).reduce((s, e) => s + e.amount, 0) +
    db.transfers.filter((t) => t.toAccountId === a.id && ok(t.date)).reduce((s, t) => s + t.amount, 0) -
    db.transfers.filter((t) => t.fromAccountId === a.id && ok(t.date)).reduce((s, t) => s + t.amount, 0)
  );
}
function toAccount(a: AccountRow): Account {
  const entryCount =
    db.expenses.filter((e) => e.accountId === a.id).length + db.incomes.filter((i) => i.accountId === a.id).length +
    db.transfers.filter((t) => t.fromAccountId === a.id || t.toAccountId === a.id).length + db.subs.filter((s) => s.accountId === a.id).length;
  return { ...a, balance: balance(a), entryCount };
}
const toCategory = (c: CategoryRow): Category => ({
  ...c, entryCount: db.expenses.filter((e) => e.categoryId === c.id).length + db.subs.filter((s) => s.categoryId === c.id).length,
});
const toExpense = (e: ExpenseRow): Expense => {
  const c = cat(e.categoryId);
  return { ...e, categoryName: c.name, categoryColor: c.color, accountName: acc(e.accountId).name };
};
const toIncome = (i: IncomeRow): Income => ({ ...i, accountName: acc(i.accountId).name });
const toTransfer = (t: TransferRow): Transfer => ({ ...t, fromAccountName: acc(t.fromAccountId).name, toAccountName: acc(t.toAccountId).name });
const toSub = (s: SubRow): Subscription => {
  const c = cat(s.categoryId);
  return {
    ...s, categoryName: c.name, categoryColor: c.color, accountName: acc(s.accountId).name,
    monthlyCost: Math.round(s.amount / months[s.cycle]), yearlyCost: Math.round((s.amount * 12) / months[s.cycle]),
  };
};
const toStock = (s: StockRow): Stock => {
  const invested = Math.round(s.units * s.avgPrice), currentValue = Math.round(s.units * s.currentPrice);
  return { ...s, invested, currentValue, gain: currentValue - invested };
};
const toFund = (f: FundRow): Fund => {
  const invested = Math.round(f.units * f.avgNav), currentValue = Math.round(f.units * f.currentNav);
  return { ...f, invested, currentValue, gain: currentValue - invested };
};
const byDateDesc = <T extends { date: string; id: number }>(a: T, b: T) => b.date.localeCompare(a.date) || b.id - a.id;

function nextSip(f: FundRow, today: string): string | null {
  if (f.sipAmount <= 0) return null;
  const from = f.sipStart > today ? f.sipStart : today;
  const candidate = `${from.slice(0, 8)}${String(f.sipDay).padStart(2, "0")}`;
  return candidate >= from ? candidate : addMonthsISO(candidate, 1);
}

function validateExpense(i: ExpenseInput) {
  const description = req(i.description, "Description");
  cat(i.categoryId);
  acc(i.accountId);
  date(i.date, "Date");
  pos(i.amount, "Amount");
  return description;
}

type Args = Record<string, any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const handlers: Record<string, (a: any) => unknown> = {
  list_accounts: () => db.accounts.map(toAccount).sort((a, b) => b.balance - a.balance),
  create_account: ({ input }) => {
    const name = req(input.name, "Account name", 60);
    uniq(db.accounts, name, null, "An account with this name already exists.");
    const row = { id: id(), name, kind: input.kind, openingBalance: input.openingBalance };
    db.accounts.push(row);
    return toAccount(row);
  },
  update_account: ({ id: aid, input }) => {
    const name = req(input.name, "Account name", 60);
    uniq(db.accounts, name, aid, "An account with this name already exists.");
    const a = acc(aid);
    Object.assign(a, { name, kind: input.kind, openingBalance: input.openingBalance });
    return toAccount(a);
  },
  delete_account: ({ id: aid, moveTo }) => {
    const a = toAccount(acc(aid));
    if (a.entryCount > 0) {
      if (!moveTo) fail("Choose an account to move this account's entries to.");
      if (moveTo === aid) fail("Choose a different account to move entries to.");
      acc(moveTo);
      db.transfers = db.transfers.filter((t) => !((t.fromAccountId === aid && t.toAccountId === moveTo) || (t.fromAccountId === moveTo && t.toAccountId === aid)));
      for (const list of [db.expenses, db.incomes, db.subs]) for (const r of list) if (r.accountId === aid) r.accountId = moveTo;
      for (const t of db.transfers) {
        if (t.fromAccountId === aid) t.fromAccountId = moveTo;
        if (t.toAccountId === aid) t.toAccountId = moveTo;
      }
    }
    db.accounts = db.accounts.filter((x) => x.id !== aid);
  },
  list_categories: () => db.categories.map(toCategory),
  create_category: ({ input }) => {
    const name = req(input.name, "Category name", 40);
    uniq(db.categories, name, null, "A category with this name already exists.");
    const row = { id: id(), name, bucket: input.bucket, color: input.color };
    db.categories.push(row);
    return toCategory(row);
  },
  update_category: ({ id: cid, input }) => {
    const name = req(input.name, "Category name", 40);
    uniq(db.categories, name, cid, "A category with this name already exists.");
    const c = cat(cid);
    if (c.bucket !== input.bucket) for (const r of [...db.expenses, ...db.subs]) if (r.categoryId === cid) r.bucket = input.bucket;
    Object.assign(c, { name, bucket: input.bucket, color: input.color });
    return toCategory(c);
  },
  delete_category: ({ id: cid, replacement }) => {
    const c = toCategory(cat(cid));
    if (c.entryCount > 0) {
      if (!replacement) fail("Choose a category to move existing entries to.");
      const to = cat(replacement);
      for (const r of [...db.expenses, ...db.subs]) if (r.categoryId === cid) Object.assign(r, { categoryId: to.id, bucket: to.bucket });
    }
    db.categories = db.categories.filter((x) => x.id !== cid);
  },
  list_expenses: ({ filter }: { filter: ExpenseFilter }) => {
    if (filter.from && filter.to && filter.from > filter.to) fail("From date must be on or before To date.");
    const s = filter.search?.trim().toLowerCase();
    return db.expenses
      .filter((e) => (filter.from || filter.to ? true : !filter.month || inMonth(e.date, filter.month)))
      .filter((e) => !filter.from || e.date >= filter.from)
      .filter((e) => !filter.to || e.date <= filter.to)
      .filter((e) => !s || e.description.toLowerCase().includes(s))
      .filter((e) => !filter.bucket || e.bucket === filter.bucket)
      .filter((e) => !filter.categoryId || e.categoryId === filter.categoryId)
      .filter((e) => !filter.accountId || e.accountId === filter.accountId)
      .sort(byDateDesc)
      .map(toExpense);
  },
  create_expense: ({ input }: { input: ExpenseInput }) => {
    const description = validateExpense(input);
    let subscriptionId: number | null = null;
    if (input.subscription?.kind === "existing") {
      const s = db.subs.find((x) => x.id === (input.subscription as { id: number }).id) ?? fail("Choose a subscription.");
      s.renewsOn = addMonthsISO(s.renewsOn, months[s.cycle]);
      subscriptionId = s.id;
    } else if (input.subscription?.kind === "new") {
      const cycle = input.subscription.cycle;
      const row: SubRow = { id: id(), name: description, categoryId: input.categoryId, bucket: input.bucket, cycle, amount: input.amount, renewsOn: addMonthsISO(input.date, months[cycle]), accountId: input.accountId, status: "active" };
      db.subs.push(row);
      subscriptionId = row.id;
    }
    const row: ExpenseRow = { id: id(), description, categoryId: input.categoryId, accountId: input.accountId, bucket: input.bucket, date: input.date, amount: input.amount, subscriptionId };
    db.expenses.push(row);
    return toExpense(row);
  },
  update_expense: ({ id: eid, input }) => {
    const description = validateExpense(input);
    const e = db.expenses.find((x) => x.id === eid) ?? fail("That expense no longer exists.", "not_found");
    Object.assign(e, { description, categoryId: input.categoryId, accountId: input.accountId, bucket: input.bucket, date: input.date, amount: input.amount, subscriptionId: input.subscription?.kind === "existing" ? input.subscription.id : null });
    return toExpense(e);
  },
  delete_expense: ({ id: eid }) => void (db.expenses = db.expenses.filter((e) => e.id !== eid)),
  list_incomes: ({ month }) => db.incomes.filter((i) => inMonth(i.date, month)).sort(byDateDesc).map(toIncome),
  create_income: ({ input }) => {
    const row = { id: id(), name: req(input.name, "Income name", 60), accountId: acc(input.accountId).id, date: date(input.date, "Date"), amount: pos(input.amount, "Amount") };
    db.incomes.push(row);
    return toIncome(row);
  },
  update_income: ({ id: iid, input }) => {
    const i = db.incomes.find((x) => x.id === iid) ?? fail("That income entry no longer exists.", "not_found");
    Object.assign(i, { name: req(input.name, "Income name", 60), accountId: acc(input.accountId).id, date: date(input.date, "Date"), amount: pos(input.amount, "Amount") });
    return toIncome(i);
  },
  delete_income: ({ id: iid }) => void (db.incomes = db.incomes.filter((i) => i.id !== iid)),
  list_transfers: ({ month }) => db.transfers.filter((t) => inMonth(t.date, month)).sort(byDateDesc).map(toTransfer),
  create_transfer: ({ input }) => {
    acc(input.fromAccountId); acc(input.toAccountId);
    if (input.fromAccountId === input.toAccountId) fail("From and To accounts must be different.");
    const row = { id: id(), fromAccountId: input.fromAccountId, toAccountId: input.toAccountId, date: date(input.date, "Date"), amount: pos(input.amount, "Amount"), note: (input.note ?? "").trim() };
    db.transfers.push(row);
    return toTransfer(row);
  },
  update_transfer: ({ id: tid, input }) => {
    if (input.fromAccountId === input.toAccountId) fail("From and To accounts must be different.");
    const t = db.transfers.find((x) => x.id === tid) ?? fail("That transfer no longer exists.", "not_found");
    Object.assign(t, { fromAccountId: acc(input.fromAccountId).id, toAccountId: acc(input.toAccountId).id, date: date(input.date, "Date"), amount: pos(input.amount, "Amount"), note: (input.note ?? "").trim() });
    return toTransfer(t);
  },
  delete_transfer: ({ id: tid }) => void (db.transfers = db.transfers.filter((t) => t.id !== tid)),
  list_subscriptions: () => {
    const rank = { active: 0, paused: 1, cancelled: 2 };
    return [...db.subs].sort((a, b) => rank[a.status] - rank[b.status] || a.renewsOn.localeCompare(b.renewsOn)).map(toSub);
  },
  create_subscription: ({ input }) => {
    cat(input.categoryId); acc(input.accountId);
    const row: SubRow = { id: id(), name: req(input.name, "Subscription name", 60), categoryId: input.categoryId, bucket: input.bucket, cycle: input.cycle, amount: pos(input.amount, "Amount per cycle"), renewsOn: date(input.renewsOn, "Renews at"), accountId: input.accountId, status: input.status };
    db.subs.push(row);
    return toSub(row);
  },
  update_subscription: ({ id: sid, input }) => {
    const s = db.subs.find((x) => x.id === sid) ?? fail("That subscription no longer exists.", "not_found");
    Object.assign(s, { name: req(input.name, "Subscription name", 60), categoryId: cat(input.categoryId).id, bucket: input.bucket, cycle: input.cycle, amount: pos(input.amount, "Amount per cycle"), renewsOn: date(input.renewsOn, "Renews at"), accountId: acc(input.accountId).id, status: input.status });
    return toSub(s);
  },
  delete_subscription: ({ id: sid }) => {
    db.subs = db.subs.filter((s) => s.id !== sid);
    for (const e of db.expenses) if (e.subscriptionId === sid) e.subscriptionId = null;
  },
  pay_subscription: ({ id: sid }) => {
    const s = db.subs.find((x) => x.id === sid) ?? fail("That subscription no longer exists.", "not_found");
    if (s.status !== "active") fail("Only active subscriptions can be paid. Set it to Active first.");
    db.expenses.push({ id: id(), description: s.name, categoryId: s.categoryId, accountId: s.accountId, bucket: s.bucket, date: todayISO(), amount: s.amount, subscriptionId: s.id });
    s.renewsOn = addMonthsISO(s.renewsOn, months[s.cycle]);
    return toSub(s);
  },
  get_portfolio: () => {
    const stocks = db.stocks.map(toStock).sort((a, b) => b.currentValue - a.currentValue);
    const funds = db.funds.map(toFund).sort((a, b) => b.currentValue - a.currentValue);
    const all = [...stocks, ...funds];
    const invested = all.reduce((s, h) => s + h.invested, 0);
    const currentValue = all.reduce((s, h) => s + h.currentValue, 0);
    const sips = db.funds.filter((f) => f.sipAmount > 0);
    const next = sips.map((f) => nextSip(f, todayISO())).filter(Boolean).sort()[0] ?? null;
    return { invested, currentValue, gain: currentValue - invested, holdings: all.length, stocks, funds, sipMonthly: sips.reduce((s, f) => s + f.sipAmount, 0), activeSips: sips.length, nextSipDate: next };
  },
  create_stock: ({ input }) => {
    const row = { id: id(), ...validateStock(input) };
    db.stocks.push(row);
    return toStock(row);
  },
  update_stock: ({ id: sid, input }) => {
    const s = db.stocks.find((x) => x.id === sid) ?? fail("That stock no longer exists.", "not_found");
    Object.assign(s, validateStock(input));
    return toStock(s);
  },
  delete_stock: ({ id: sid }) => void (db.stocks = db.stocks.filter((s) => s.id !== sid)),
  create_fund: ({ input }) => {
    const row = { id: id(), ...validateFund(input) };
    db.funds.push(row);
    return toFund(row);
  },
  update_fund: ({ id: fid, input }) => {
    const f = db.funds.find((x) => x.id === fid) ?? fail("That fund no longer exists.", "not_found");
    Object.assign(f, validateFund(input));
    return toFund(f);
  },
  delete_fund: ({ id: fid }) => void (db.funds = db.funds.filter((f) => f.id !== fid)),
  get_settings: () => ({ ...db.settings }),
  save_settings: ({ input }: { input: Settings }) => {
    const total = input.needsPct + input.wantsPct + input.savingsPct;
    if (total !== 100) fail(`Your percentages add up to ${total}%. They must add up to 100%.`);
    if (input.goalAmount <= 0) fail("Goal amount must be more than ₹0.");
    if (!(input.reminderDays >= 1 && input.reminderDays <= 7)) fail("Remind me between 1 and 7 days before a renewal.");
    db.settings = { ...input };
    return { ...db.settings };
  },
  get_dashboard: ({ month }) => dashboard(month),
  get_today: () => todayISO(),
  backup_database: () => undefined,
  restore_database: () => fail("Restoring a backup works in the desktop app."),
  export_expenses: ({ filter, path }: { filter: ExpenseFilter; path: string }) => {
    const rows = handlers.list_expenses({ filter }) as Expense[];
    const field = (v: string) => {
      const t = /^[=+\-@]/.test(v) ? `'${v}` : v;
      return /[",\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
    };
    const label = { needs: "Needs", wants: "Wants", savings: "Savings" } as const;
    const lines = rows.map((e) =>
      [`${e.date.slice(8, 10)}-${e.date.slice(5, 7)}-${e.date.slice(0, 4)}`, field(e.description), field(e.categoryName), label[e.bucket], field(e.accountName), (e.amount / 100).toFixed(2)].join(","),
    );
    const csv = "\ufeffDate,Description,Category,Bucket,Account,Amount (INR)\r\n" + lines.map((l) => l + "\r\n").join("");
    if (typeof document !== "undefined" && typeof URL.createObjectURL === "function") {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
      a.download = path;
      a.click();
    }
    return rows.length;
  },
};

function validateStock(input: any): Omit<StockRow, "id"> {
  const today = todayISO();
  if (!(input.units > 0)) fail("Units must be more than 0.");
  pos(input.avgPrice, "Average buy price");
  pos(input.currentPrice, "Current price");
  date(input.purchaseDate, "Purchase date");
  if (input.purchaseDate > today) fail("Purchase date can't be in the future.");
  return { name: req(input.name, "Holding"), ticker: req(input.ticker, "Ticker", 20).toUpperCase(), exchange: input.exchange, units: input.units, avgPrice: input.avgPrice, currentPrice: input.currentPrice, purchaseDate: input.purchaseDate };
}
function validateFund(input: any): Omit<FundRow, "id"> {
  if (!(input.units > 0)) fail("Units must be more than 0.");
  pos(input.avgNav, "Average buy NAV");
  pos(input.currentNav, "Current NAV");
  if (!(input.sipDay >= 1 && input.sipDay <= 28)) fail("SIP day must be between 1 and 28.");
  date(input.sipStart, "SIP start date");
  return { name: req(input.name, "Fund name"), plan: req(input.plan, "Plan", 40), units: input.units, avgNav: input.avgNav, currentNav: input.currentNav, sipAmount: input.sipAmount, sipDay: input.sipDay, sipStart: input.sipStart };
}

function dashboard(month: string): Dashboard {
  const today = todayISO();
  const accounts = db.accounts.reduce((s, a) => s + balance(a), 0);
  const invest = db.stocks.reduce((s, x) => s + Math.round(x.units * x.currentPrice), 0) + db.funds.reduce((s, f) => s + Math.round(f.units * f.currentNav), 0);
  const prevEnd = (() => {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(y, m - 1, 0);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();
  const prev = db.accounts.reduce((s, a) => s + balance(a, prevEnd), 0) + invest;
  const netWorth = accounts + invest;
  const income = db.incomes.filter((i) => inMonth(i.date, month)).reduce((s, i) => s + i.amount, 0);
  const monthExpenses = db.expenses.filter((e) => inMonth(e.date, month));
  const pcts: Record<Bucket, number> = { needs: db.settings.needsPct, wants: db.settings.wantsPct, savings: db.settings.savingsPct };
  const buckets = (["needs", "wants", "savings"] as Bucket[]).map((bucket) => {
    const spent = monthExpenses.filter((e) => e.bucket === bucket).reduce((s, e) => s + e.amount, 0);
    const limit = income > 0 ? Math.floor((income * pcts[bucket]) / 100) : null;
    return { bucket, spent, limit, pct: limit ? Math.round((spent / limit) * 100) : 0 };
  });
  const end = (() => { const d = new Date(); d.setDate(d.getDate() + 7); return d.toISOString().slice(0, 10); })();
  const upcoming = db.subs.filter((s) => s.status === "active" && s.renewsOn >= today && s.renewsOn <= end).sort((a, b) => a.renewsOn.localeCompare(b.renewsOn));
  const byCat = new Map<number, number>();
  for (const e of monthExpenses) byCat.set(e.categoryId, (byCat.get(e.categoryId) ?? 0) + e.amount);
  const spendByCategory = [...byCat.entries()].map(([categoryId, amount]) => {
    const c = cat(categoryId);
    return { categoryId, name: c.name, color: c.color, amount };
  }).sort((a, b) => b.amount - a.amount);
  return {
    month, goalTarget: db.settings.goalAmount, goalAccounts: accounts, goalInvestments: invest, netWorth,
    netWorthChangePct: prev > 0 ? ((netWorth - prev) / prev) * 100 : null, income, buckets,
    renewals: upcoming.map((s) => ({ id: s.id, name: s.name, date: s.renewsOn, daysLeft: daysBetween(today, s.renewsOn), amount: s.amount })),
    renewalsTotal: upcoming.reduce((s, x) => s + x.amount, 0),
    recent: [...db.expenses].sort(byDateDesc).slice(0, 6).map(toExpense),
    spendTotal: monthExpenses.reduce((s, e) => s + e.amount, 0), spendByCategory, hasAccounts: db.accounts.length > 0,
  };
}

export async function mockInvoke(cmd: string, args: Args = {}): Promise<unknown> {
  const h = handlers[cmd];
  if (!h) fail(`Unknown command: ${cmd}`, "internal");
  await new Promise((r) => setTimeout(r, 0));
  return structuredClone(h(args));
}

export type { Row };
