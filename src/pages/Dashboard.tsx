import { hierarchy, treemap, treemapSquarify } from "d3-hierarchy";
import { useLayoutEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";

import { useDashboard } from "../api";
import type { BucketBudget } from "../bindings/BucketBudget";
import type { CategorySpend } from "../bindings/CategorySpend";
import mascot from "../assets/figma/mascot.png";
import { BucketBadge, Button, CategoryInitial, EmptyState, MonthSwitcher } from "../components/ui";
import { BUCKET_BAR, BUCKET_LABEL, categoryColors } from "../lib/colors";
import { currentMonth, dayMonth, inDays, monthName, percent, plural, rupees, rupeesShort, weekdayDate } from "../lib/format";

export function DashboardPage() {
  const [month, setMonth] = useState(currentMonth());
  const { data: d, isLoading } = useDashboard(month);
  const navigate = useNavigate();
  if (isLoading || !d) return <p className="loading">Loading dashboard…</p>;

  const goalFilled = d.goalTarget > 0 ? Math.min(1, Math.max(0, d.goalAccounts + d.goalInvestments) / d.goalTarget) : 0;
  const invShare = d.goalTarget > 0 ? Math.min(1, Math.max(0, d.goalInvestments) / d.goalTarget) : 0;

  return (
    <div className="page page--dashboard">
      <h1 className="visually-hidden">Dashboard</h1>
      <div className="dash-grid">
        {/* Goal (DSH-01) */}
        <section className="hero-card" aria-labelledby="goal-heading">
          <h2 id="goal-heading" className="hero-card__label">
            Goal
          </h2>
          <div className="goal">
            <div
              className="goal__bar"
              role="img"
              aria-label={`${Math.round(goalFilled * 100)}% of your ${rupeesShort(d.goalTarget)} goal reached: ${rupees(d.goalInvestments)} in investments and ${rupees(d.goalAccounts)} in accounts.`}
            >
              <span className="goal__accounts" style={{ width: `${goalFilled * 100}%` }} />
              <span className="goal__investments" style={{ width: `${invShare * 100}%` }} />
            </div>
            <span className="goal__target num">{rupeesShort(d.goalTarget)}</span>
          </div>
          <ul className="goal__legend" aria-hidden>
            <li>
              <span className="swatch swatch--square" style={{ background: "var(--goal-investments)" }} />
              {rupees(d.goalInvestments, { decimals: 0 })} Investment
            </li>
            <li>
              <span className="swatch swatch--square" style={{ background: "var(--goal-accounts)" }} />
              {rupees(d.goalAccounts, { decimals: 0 })} Account
            </li>
          </ul>
        </section>

        {/* Net worth (DSH-02) */}
        <section className="hero-card hero-card--networth" aria-labelledby="nw-heading">
          <h2 id="nw-heading" className="hero-card__label">
            Net worth
          </h2>
          <p className="networth">
            <span className="networth__value num">{rupees(d.netWorth, { decimals: 0 })}</span>
            {d.netWorthChangePct != null && Math.abs(d.netWorthChangePct) >= 0.05 && (
              <span className="networth__change">
                <span className={d.netWorthChangePct >= 0 ? "text-success" : "text-danger"}>{percent(d.netWorthChangePct, { sign: true, decimals: 1 })}</span>{" "}
                <span className="text-secondary">this month</span>
              </span>
            )}
          </p>
          <img className="hero-card__mascot" src={mascot} alt="" width={148} height={148} />
        </section>

        {/* Budget against limits (DSH-03, DSH-04) */}
        <section className="card card--budget dash-card" aria-labelledby="budget-heading">
          <div className="dash-card__head">
            <div>
              <h2 id="budget-heading" className="card__title">
                Budget against limits
              </h2>
              <p className="card__subtitle">
                {d.income > 0
                  ? "Bar is spent. The black mark is the limit. Shaded zones show 80% and over-budget"
                  : `No income logged for ${monthName(month)} yet, so limits can’t be set. Bars show spending only.`}
              </p>
            </div>
            <MonthSwitcher month={month} onChange={setMonth} max={currentMonth()} />
          </div>
          <BudgetBars buckets={d.buckets} />
          <div className="budget-legend">
            <ul className="budget-legend__used">
              {d.buckets.map((b) => (
                <li key={b.bucket}>
                  <span className="legend-key">
                    <span className="swatch swatch--dot" style={{ background: BUCKET_BAR[b.bucket] }} aria-hidden />
                    {BUCKET_LABEL[b.bucket]}
                  </span>
                  <span className="legend-value num">{b.limit != null ? `${b.pct} %` : "—"}</span>
                </li>
              ))}
            </ul>
            {d.income > 0 ? (
              <ul className="budget-legend__zones" aria-label="Zones">
                <li>
                  <span className="legend-key">
                    <span className="swatch swatch--dot swatch--near" aria-hidden />
                    Near limit
                  </span>
                  <span className="legend-value">80-100 %</span>
                </li>
                <li>
                  <span className="legend-key">
                    <span className="swatch swatch--dot swatch--over" aria-hidden />
                    Over
                  </span>
                  <span className="legend-value">&gt;100 %</span>
                </li>
              </ul>
            ) : (
              <Link className="btn btn--link" to="/accounts">
                Log this month’s income to see limits →
              </Link>
            )}
          </div>
        </section>

        {/* Renewals this week (DSH-05) */}
        <section className="card card--panel dash-card renewals" aria-labelledby="renewals-heading">
          <div className="dash-card__head">
            <div>
              <h2 id="renewals-heading" className="renewals__title">
                Renewals this week
              </h2>
              <p className="renewals__summary">
                {plural(d.renewals.length, "renewal")} · {rupees(d.renewalsTotal)}
              </p>
            </div>
            {d.renewals.length > 0 && <Button onPress={() => navigate("/subscriptions")}>See all</Button>}
          </div>
          {d.renewals.length === 0 ? (
            <EmptyState title="Nothing renews this week" hint="Active subscriptions renewing in the next 7 days appear here." actionLabel="Add subscription" onAction={() => navigate("/subscriptions")} />
          ) : (
            <ol className="timeline">
              {d.renewals.map((r) => (
                <li key={r.id}>
                  <span className={`timeline__marker ${r.daysLeft <= 2 ? "timeline__marker--soon" : ""}`} aria-hidden />
                  <span className="timeline__text">
                    <span className="timeline__name">{r.name}</span>
                    <span className="timeline__date">
                      <time dateTime={r.date}>{weekdayDate(r.date)}</time> · {inDays(r.daysLeft)}
                    </span>
                  </span>
                  <span className="timeline__amount num">{rupees(r.amount)}</span>
                </li>
              ))}
            </ol>
          )}
        </section>

        {/* Recent transactions (DSH-06) */}
        <section className="card card--panel table-card recent" aria-labelledby="recent-heading">
          <div className="dash-card__head recent__head">
            <h2 id="recent-heading" className="card__title">
              Recent transactions
            </h2>
            {d.recent.length > 0 && <Button onPress={() => navigate("/expenses")}>See all</Button>}
          </div>
          {d.recent.length === 0 ? (
            <EmptyState title="No transactions yet" hint="Expenses you log will show up here, newest first." actionLabel="Add expense" onAction={() => navigate("/expenses")} />
          ) : (
            <table className="table table--recent">
              <colgroup>
                <col />
                <col style={{ width: 142 }} />
                <col style={{ width: 80 }} />
                <col style={{ width: 76 }} />
                <col style={{ width: 82 }} />
              </colgroup>
              <thead>
                <tr>
                  <th scope="col">Description</th>
                  <th scope="col">Category</th>
                  <th scope="col">Date</th>
                  <th scope="col" className="col-amount" style={{ fontWeight: 400, color: "var(--text-table-header)" }}>
                    Amount
                  </th>
                  <th scope="col" style={{ paddingLeft: 12 }}>
                    Bucket
                  </th>
                </tr>
              </thead>
              <tbody>
                {d.recent.map((e) => (
                  <tr key={e.id}>
                    <td className="cell-primary">
                      <span className="desc-cell">
                        <CategoryInitial name={e.categoryName} color={e.categoryColor} />
                        <span>{e.description}</span>
                      </span>
                    </td>
                    <td>{e.categoryName}</td>
                    <td>
                      <time dateTime={e.date}>{dayMonth(e.date)}</time>
                    </td>
                    <td className="col-amount">{rupees(e.amount)}</td>
                    <td style={{ paddingLeft: 12 }}>
                      <BucketBadge bucket={e.bucket} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* Where it went (DSH-07) */}
        <section className="card card--panel dash-card where" aria-labelledby="where-heading">
          <div>
            <h2 id="where-heading" className="card__title where__title">
              Where it went
            </h2>
            <p className="card__subtitle">{d.spendTotal > 0 ? `Block size shows share of ${rupees(d.spendTotal)}` : `Nothing spent in ${monthName(month)} yet`}</p>
          </div>
          {d.spendTotal > 0 ? (
            <Treemap items={d.spendByCategory} total={d.spendTotal} />
          ) : (
            <EmptyState title="No spending to show" hint="Your biggest spending categories appear here once you log expenses." />
          )}
        </section>
      </div>
    </div>
  );
}

function BudgetBars({ buckets }: { buckets: BucketBudget[] }) {
  // Without limits, scale every bar against the biggest spend so they stay comparable.
  const maxSpent = Math.max(1, ...buckets.map((b) => b.spent));
  return (
    <ul className="budget-bars">
      {buckets.map((b) => {
        const label = BUCKET_LABEL[b.bucket];
        // The track runs to 107.5% of the limit, so the limit marker sits near the end (as in Figma).
        const scale = b.limit != null && b.limit > 0 ? Math.max(b.limit * 1.075, b.spent) : maxSpent * 1.1;
        const spentPct = Math.min(100, (b.spent / scale) * 100);
        const limitPct = b.limit ? (b.limit / scale) * 100 : null;
        const status = b.limit == null ? "" : b.pct > 100 ? ", over budget" : b.pct >= 80 ? ", near the limit" : "";
        const aria =
          b.limit != null
            ? `${label}: ${rupees(b.spent)} spent of ${rupees(b.limit)} limit, ${b.pct}%${status}`
            : `${label}: ${rupees(b.spent)} spent, no limit set`;
        return (
          <li key={b.bucket} className="budget-row">
            <span className="budget-row__label">{label}</span>
            <span className="budget-row__track" role="img" aria-label={aria}>
              {limitPct != null && (
                <>
                  <span className="zone zone--near" style={{ left: `${limitPct * 0.8}%`, width: `${limitPct * 0.2}%` }} />
                  <span className="zone zone--over" style={{ left: `${limitPct}%`, right: 0 }} />
                </>
              )}
              <span className="budget-row__fill" style={{ width: `${spentPct}%`, background: BUCKET_BAR[b.bucket] }} />
              {limitPct != null && <span className="budget-row__marker" style={{ left: `${limitPct}%` }} />}
            </span>
            <span className={`budget-row__amount num ${b.limit != null && b.pct > 100 ? "text-danger" : ""}`} aria-hidden>
              {b.limit != null ? `${rupees(b.spent, { decimals: 0 })}/${rupees(b.limit, { decimals: 0 })}` : `${rupees(b.spent, { decimals: 0 })} spent`}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

const MAX_TILES = 5;

function Treemap({ items, total }: { items: CategorySpend[]; total: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 431, h: 277 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const top = items.slice(0, MAX_TILES);
  const rest = items.slice(MAX_TILES).reduce((s, c) => s + c.amount, 0);
  const tiles = [...top.map((c) => ({ key: String(c.categoryId), name: c.name, amount: c.amount, color: c.color })), ...(rest > 0 ? [{ key: "other", name: "Other", amount: rest, color: "purple" }] : [])];

  type Node = { children?: typeof tiles } & Partial<(typeof tiles)[number]>;
  const root = hierarchy<Node>({ children: tiles }).sum((n) => n.amount ?? 0);
  treemap<Node>().tile(treemapSquarify.ratio(1.2)).size([size.w, size.h]).paddingInner(6).round(true)(root);

  return (
    <>
      <div className="treemap" ref={ref} aria-hidden>
        {root.leaves().map((leaf) => {
          const n = leaf.data;
          const l = leaf as unknown as { x0: number; x1: number; y0: number; y1: number };
          const w = l.x1 - l.x0, h = l.y1 - l.y0;
          return (
            <div key={n.key} className="treemap__tile" style={{ left: l.x0, top: l.y0, width: w, height: h, background: categoryColors(n.color!).bg }}>
              {w > 64 && h > 40 && (
                <>
                  <span className="treemap__name">{n.name}</span>
                  <span className="treemap__amount">{rupees(n.amount!, { decimals: 0 })}</span>
                </>
              )}
            </div>
          );
        })}
      </div>
      <table className="visually-hidden">
        <caption>Spending by category</caption>
        <thead>
          <tr>
            <th scope="col">Category</th>
            <th scope="col">Amount</th>
            <th scope="col">Share</th>
          </tr>
        </thead>
        <tbody>
          {tiles.map((t) => (
            <tr key={t.key}>
              <th scope="row">{t.name}</th>
              <td>{rupees(t.amount)}</td>
              <td>{Math.round((t.amount / total) * 100)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
