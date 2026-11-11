/** Money is integer paise everywhere; these helpers format and parse it (en-IN, ₹). */

const inr0 = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0, minimumFractionDigits: 0 });
const inr2 = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2, minimumFractionDigits: 2 });
const num = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 3 });

export type MoneyOpts = {
  /** "auto" shows paise only when present. */
  decimals?: "auto" | 0 | 2;
  /** Prefix + for positive values (gains). */
  sign?: boolean;
};

export function rupees(paise: number, opts: MoneyOpts = {}): string {
  const { decimals = "auto", sign = false } = opts;
  const abs = Math.abs(paise) / 100;
  const useTwo = decimals === 2 || (decimals === "auto" && Math.abs(paise) % 100 !== 0);
  const body = (useTwo ? inr2 : inr0).format(abs);
  if (paise < 0) return `−${body}`;
  if (sign && paise > 0) return `+${body}`;
  return body;
}

/** "₹2 Lakh", "₹20 Lakh", "₹1.5 Cr" for headline goal amounts. */
export function rupeesShort(paise: number): string {
  const r = paise / 100;
  if (r >= 1_00_00_000) return `₹${trim(r / 1_00_00_000)} Cr`;
  if (r >= 1_00_000) return `₹${trim(r / 1_00_000)} Lakh`;
  return rupees(paise, { decimals: 0 });
}
function trim(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

export function percent(value: number, opts: { sign?: boolean; decimals?: number } = {}): string {
  const { sign = false, decimals = 2 } = opts;
  const s = Math.abs(value).toFixed(decimals);
  if (value < 0) return `−${s}%`;
  return `${sign && value > 0 ? "+" : ""}${s}%`;
}

export function units(n: number): string {
  return num.format(n);
}

/** "1,23,456.50" / "₹649" → paise. Returns null when not a valid amount. */
export function parseRupees(input: string): number | null {
  const cleaned = input.replace(/[₹,\s]/g, "");
  if (!cleaned) return null;
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) return null;
  return Math.round(parseFloat(cleaned) * 100);
}

/** Paise → editable string without symbol or grouping ("649", "124.92"). */
export function paiseToInput(paise: number): string {
  if (paise % 100 === 0) return String(paise / 100);
  return (paise / 100).toFixed(2);
}

// ---------- Dates (stored as YYYY-MM-DD) ----------

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const SHORT = MONTHS.map((m) => m.slice(0, 3));
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function parseISO(d: string): Date {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, m - 1, day);
}

export function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function todayISO(): string {
  return toISO(new Date());
}

/** "5 Nov" */
export function dayMonth(iso: string): string {
  const d = parseISO(iso);
  return `${d.getDate()} ${SHORT[d.getMonth()]}`;
}

/** "18 Nov 2026" */
export function longDate(iso: string): string {
  const d = parseISO(iso);
  return `${d.getDate()} ${SHORT[d.getMonth()]} ${d.getFullYear()}`;
}

/** "Sun 8 Nov" */
export function weekdayDate(iso: string): string {
  const d = parseISO(iso);
  return `${DAYS[d.getDay()]} ${d.getDate()} ${SHORT[d.getMonth()]}`;
}

export function currentMonth(): string {
  return todayISO().slice(0, 7);
}

/** "2026-11" → "November" (or "November 2026" with year) */
export function monthName(month: string, withYear = false): string {
  const [y, m] = month.split("-").map(Number);
  return withYear ? `${MONTHS[m - 1]} ${y}` : MONTHS[m - 1];
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Add calendar months, clamping to month end (31 Jan + 1 → 28 Feb). */
export function addMonthsISO(iso: string, months: number): string {
  const d = parseISO(iso);
  const day = d.getDate();
  const target = new Date(d.getFullYear(), d.getMonth() + months, 1);
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(day, last));
  return toISO(target);
}

export function daysBetween(fromISO: string, toISOString: string): number {
  return Math.round((parseISO(toISOString).getTime() - parseISO(fromISO).getTime()) / 86_400_000);
}

export function inDays(n: number): string {
  if (n <= 0) return "today";
  if (n === 1) return "tomorrow";
  return `in ${n} days`;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}
