import { useEffect, useState } from "react";
import { Tab, TabList, TabPanel, Tabs } from "react-aria-components";

import { api, usePortfolio, useSave } from "../api";
import type { Exchange } from "../bindings/Exchange";
import type { Fund } from "../bindings/Fund";
import type { Stock } from "../bindings/Stock";
import {
  AmountInput,
  Button,
  ConfirmDelete,
  DateInput,
  EmptyState,
  FormDialog,
  PageHeader,
  RowActions,
  SelectField,
  TextInput,
  partsFromISO,
  partsToISO,
  useToast,
  type DateParts,
} from "../components/ui";
import { longDate, paiseToInput, parseRupees, percent, plural, rupees, todayISO, units as fmtUnits } from "../lib/format";

const pct = (gain: number, invested: number) => (invested > 0 ? (gain / invested) * 100 : 0);
const tone = (n: number) => (n > 0 ? "text-success" : n < 0 ? "text-danger" : undefined);
const ordinal = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th"}`;

export function InvestmentsPage() {
  const toast = useToast();
  const { data: p, isLoading } = usePortfolio();
  const [tab, setTab] = useState<"stocks" | "funds">("stocks");
  const [stockDialog, setStockDialog] = useState<{ open: boolean; stock?: Stock }>({ open: false });
  const [fundDialog, setFundDialog] = useState<{ open: boolean; fund?: Fund }>({ open: false });
  const [deletingStock, setDeletingStock] = useState<Stock | null>(null);
  const [deletingFund, setDeletingFund] = useState<Fund | null>(null);
  const removeStock = useSave((id: number) => api.investments.removeStock(id));
  const removeFund = useSave((id: number) => api.investments.removeFund(id));

  if (isLoading || !p) return <p className="loading">Loading investments…</p>;
  const stockInv = p.stocks.reduce((s, x) => s + x.invested, 0);
  const stockCur = p.stocks.reduce((s, x) => s + x.currentValue, 0);
  const fundInv = p.funds.reduce((s, x) => s + x.invested, 0);
  const fundCur = p.funds.reduce((s, x) => s + x.currentValue, 0);

  return (
    <div className="page">
      <PageHeader title="Investments" description="Track your holdings, performance and monthly SIPs." />
      <div className="metrics metrics--3">
        <div className="metric metric--lg">
          <span className="metric__label">Total invested</span>
          <span className="metric__value num">{rupees(p.invested, { decimals: 0 })}</span>
          <span className="metric__caption">Across {plural(Number(p.holdings), "holding")}</span>
        </div>
        <div className="metric metric--lg">
          <span className="metric__label">Current value</span>
          <span className="metric__value num">{rupees(p.currentValue, { decimals: 0 })}</span>
          <span className="metric__caption">Stocks and mutual funds</span>
        </div>
        <div className="metric metric--lg">
          <span className="metric__label">Total gain</span>
          <span className={`metric__value num ${tone(p.gain) ?? ""}`}>{rupees(p.gain, { sign: true, decimals: 0 })}</span>
          <span className={`metric__caption ${tone(p.gain) ?? ""}`}>{percent(pct(p.gain, p.invested), { sign: true })} overall return</span>
        </div>
      </div>

      <Tabs selectedKey={tab} onSelectionChange={(k) => setTab(k as "stocks" | "funds")}>
        <div className="toolbar">
          <TabList className="segmented" aria-label="Investment type">
            <Tab className="segmented__item" id="stocks">Stocks</Tab>
            <Tab className="segmented__item" id="funds">Mutual funds</Tab>
          </TabList>
          {tab === "stocks" ? (
            <Button variant="primary" size="l" onPress={() => setStockDialog({ open: true })}>
              Add stock
            </Button>
          ) : (
            <Button variant="primary" size="l" onPress={() => setFundDialog({ open: true })}>
              Add mutual fund
            </Button>
          )}
        </div>

        <TabPanel id="stocks" className="tab-panel">
          <section className="card card--panel table-card holdings" aria-labelledby="stocks-heading">
            <div className="holdings__head">
              <div>
                <h2 id="stocks-heading">Stock holdings</h2>
                {p.stocks.length > 0 && <p>{plural(p.stocks.length, "holding")} · NSE / BSE</p>}
              </div>
              {p.stocks.length > 0 && <span className="holdings__meta">Prices entered manually</span>}
            </div>
            {p.stocks.length === 0 ? (
              <EmptyState
                title="No stocks yet"
                hint="Add a stock with its units, average buy price and current price to track gain and return. Prices are entered manually."
                actionLabel="Add stock"
                onAction={() => setStockDialog({ open: true })}
              />
            ) : (
              <table className="table table--holdings">
                <colgroup>
                  <col />
                  <col style={{ width: 80 }} />
                  <col style={{ width: 110 }} />
                  <col style={{ width: 120 }} />
                  <col style={{ width: 130 }} />
                  <col style={{ width: 120 }} />
                  <col style={{ width: 90 }} />
                  <col style={{ width: 96 }} />
                </colgroup>
                <thead>
                  <tr>
                    <th scope="col">Holding</th>
                    <th scope="col" className="col-num">Units</th>
                    <th scope="col" className="col-num">Avg. buy price</th>
                    <th scope="col" className="col-num">Invested</th>
                    <th scope="col" className="col-num">Current value</th>
                    <th scope="col" className="col-num">Gain / loss</th>
                    <th scope="col" className="col-num">Return</th>
                    <th scope="col" className="col-num">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {p.stocks.map((s) => (
                    <tr key={s.id}>
                      <td>
                        <span className="holding-name">{s.name}</span>
                        <span className="holding-sub">
                          {s.ticker} · {s.exchange}
                        </span>
                      </td>
                      <td className="col-num">{fmtUnits(s.units)}</td>
                      <td className="col-num">{rupees(s.avgPrice, { decimals: 2 })}</td>
                      <td className="col-num">{rupees(s.invested)}</td>
                      <td className="col-num">{rupees(s.currentValue)}</td>
                      <td className={`col-num ${tone(s.gain) ?? ""}`}>{rupees(s.gain, { sign: true })}</td>
                      <td className={`col-num ${tone(s.gain) ?? ""}`}>{percent(pct(s.gain, s.invested), { sign: true })}</td>
                      <td>
                        <RowActions label={s.name} onEdit={() => setStockDialog({ open: true, stock: s })} onDelete={() => setDeletingStock(s)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th scope="row">Stocks total</th>
                    <td colSpan={3} className="col-num">
                      Invested {rupees(stockInv)}
                    </td>
                    <td className="col-num">Current {rupees(stockCur)}</td>
                    <td colSpan={3} className={`col-num ${tone(stockCur - stockInv) ?? ""}`}>
                      Gain {rupees(stockCur - stockInv, { sign: true })} ({percent(pct(stockCur - stockInv, stockInv), { sign: true })})
                    </td>
                  </tr>
                </tfoot>
              </table>
            )}
          </section>
        </TabPanel>

        <TabPanel id="funds" className="tab-panel">
          <section className="card card--panel table-card holdings" aria-labelledby="funds-heading">
            <div className="holdings__head">
              <div>
                <h2 id="funds-heading">Mutual fund holdings</h2>
                {p.funds.length > 0 && <p>{plural(p.funds.length, "holding")} · Direct growth plans</p>}
              </div>
              {p.funds.length > 0 && <span className="holdings__meta">Monthly SIPs · NAV entered manually</span>}
            </div>
            {p.funds.length === 0 ? (
              <EmptyState
                title="No mutual funds yet"
                hint="Add a fund with its NAVs and monthly SIP to track returns and your SIP commitment."
                actionLabel="Add mutual fund"
                onAction={() => setFundDialog({ open: true })}
              />
            ) : (
              <table className="table table--holdings">
                <colgroup>
                  <col />
                  <col style={{ width: 70 }} />
                  <col style={{ width: 96 }} />
                  <col style={{ width: 110 }} />
                  <col style={{ width: 110 }} />
                  <col style={{ width: 100 }} />
                  <col style={{ width: 80 }} />
                  <col style={{ width: 130 }} />
                  <col style={{ width: 96 }} />
                </colgroup>
                <thead>
                  <tr>
                    <th scope="col">Holding</th>
                    <th scope="col" className="col-num">Units</th>
                    <th scope="col" className="col-num">Avg. buy NAV</th>
                    <th scope="col" className="col-num">Invested</th>
                    <th scope="col" className="col-num">Current</th>
                    <th scope="col" className="col-num">Gain / loss</th>
                    <th scope="col" className="col-num">Return</th>
                    <th scope="col" className="col-num">Monthly SIP</th>
                    <th scope="col" className="col-num">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {p.funds.map((f) => (
                    <tr key={f.id}>
                      <td>
                        <span className="holding-name">{f.name}</span>
                        <span className="holding-sub">{f.plan}</span>
                      </td>
                      <td className="col-num">{fmtUnits(f.units)}</td>
                      <td className="col-num">{rupees(f.avgNav, { decimals: 2 })}</td>
                      <td className="col-num">{rupees(f.invested)}</td>
                      <td className="col-num">{rupees(f.currentValue)}</td>
                      <td className={`col-num ${tone(f.gain) ?? ""}`}>{rupees(f.gain, { sign: true })}</td>
                      <td className={`col-num ${tone(f.gain) ?? ""}`}>{percent(pct(f.gain, f.invested), { sign: true })}</td>
                      <td className="col-num">
                        <span className="holding-name">{f.sipAmount > 0 ? rupees(f.sipAmount) : "—"}</span>
                        {f.sipAmount > 0 && <span className="holding-sub">{ordinal(f.sipDay)} of every month</span>}
                      </td>
                      <td>
                        <RowActions label={f.name} onEdit={() => setFundDialog({ open: true, fund: f })} onDelete={() => setDeletingFund(f)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th scope="row">Mutual funds total</th>
                    <td colSpan={3} className="col-num">
                      Invested {rupees(fundInv)}
                    </td>
                    <td className="col-num">Current {rupees(fundCur)}</td>
                    <td colSpan={4} className={`col-num ${tone(fundCur - fundInv) ?? ""}`}>
                      Gain {rupees(fundCur - fundInv, { sign: true })} ({percent(pct(fundCur - fundInv, fundInv), { sign: true })})
                    </td>
                  </tr>
                </tfoot>
              </table>
            )}
          </section>
          {p.activeSips > 0 && (
            <section className="card card--panel sip-card" aria-label="Monthly SIP commitment">
              <div>
                <p className="metric__label">Monthly SIP commitment</p>
                <p className="sip-card__value num">{rupees(p.sipMonthly)} / month</p>
                <p className="metric__caption">{plural(Number(p.activeSips), "active SIP")}</p>
              </div>
              <div className="sip-card__next">
                <p className="sip-card__next-date">{p.nextSipDate ? `Next installment · ${longDate(p.nextSipDate)}` : "No upcoming installment"}</p>
                <p className="metric__caption">Add or edit a fund to update its SIP amount and schedule.</p>
              </div>
            </section>
          )}
        </TabPanel>
      </Tabs>

      <p className="page-footnote">Returns are absolute, not annualized. Prices and holdings are entered manually. A SIP schedule tracks contributions; it does not place orders.</p>

      <StockDialog isOpen={stockDialog.open} stock={stockDialog.stock} onClose={() => setStockDialog({ open: false })} />
      <FundDialog isOpen={fundDialog.open} fund={fundDialog.fund} onClose={() => setFundDialog({ open: false })} />
      {deletingStock && (
        <ConfirmDelete
          isOpen
          title="Delete this stock?"
          description="This removes the holding from your portfolio. It does not sell any shares."
          summaryTitle={deletingStock.name}
          summaryDetail={`${fmtUnits(deletingStock.units)} units · Invested ${rupees(deletingStock.invested)} · Current ${rupees(deletingStock.currentValue)}`}
          confirmLabel="Delete stock"
          onClose={() => setDeletingStock(null)}
          onConfirm={async () => {
            await removeStock.mutateAsync(deletingStock.id);
            toast(`${deletingStock.name} removed.`);
          }}
        />
      )}
      {deletingFund && (
        <ConfirmDelete
          isOpen
          title="Delete this mutual fund?"
          description="This removes the fund and its SIP schedule from Sparro. It does not redeem units or stop the SIP with your AMC."
          summaryTitle={`${deletingFund.name} · ${deletingFund.plan}`}
          summaryDetail={`${fmtUnits(deletingFund.units)} units · Current ${rupees(deletingFund.currentValue)}${deletingFund.sipAmount ? ` · Monthly SIP ${rupees(deletingFund.sipAmount)}` : ""}`}
          confirmLabel="Delete mutual fund"
          onClose={() => setDeletingFund(null)}
          onConfirm={async () => {
            await removeFund.mutateAsync(deletingFund.id);
            toast(`${deletingFund.name} removed.`);
          }}
        />
      )}
    </div>
  );
}

function parseUnits(v: string): number | null {
  const n = Number(v.replace(/,/g, "").trim());
  return v.trim() && Number.isFinite(n) && n > 0 ? n : null;
}

function CalcPreview({ invested, current }: { invested: number; current: number }) {
  const gain = current - invested;
  return (
    <dl className="calc-grid" aria-live="polite">
      <div>
        <dt>Invested</dt>
        <dd>{rupees(invested)}</dd>
      </div>
      <div>
        <dt>Current value</dt>
        <dd>{rupees(current)}</dd>
      </div>
      <div>
        <dt>Gain / return</dt>
        <dd className={tone(gain)}>
          {rupees(gain, { sign: true })} · {percent(pct(gain, invested))}
        </dd>
      </div>
    </dl>
  );
}

function StockDialog({ isOpen, onClose, stock }: { isOpen: boolean; onClose: () => void; stock?: Stock }) {
  const toast = useToast();
  const editing = !!stock;
  const [name, setName] = useState("");
  const [ticker, setTicker] = useState("");
  const [exchange, setExchange] = useState<Exchange>("NSE");
  const [unitsText, setUnits] = useState("");
  const [avg, setAvg] = useState("");
  const [cur, setCur] = useState("");
  const [date, setDate] = useState<DateParts>(partsFromISO(todayISO()));
  const [submitted, setSubmitted] = useState(false);
  useEffect(() => {
    if (!isOpen) return;
    setName(stock?.name ?? "");
    setTicker(stock?.ticker ?? "");
    setExchange(stock?.exchange ?? "NSE");
    setUnits(stock ? String(stock.units) : "");
    setAvg(stock ? paiseToInput(stock.avgPrice) : "");
    setCur(stock ? paiseToInput(stock.currentPrice) : "");
    setDate(partsFromISO(stock?.purchaseDate ?? todayISO()));
    setSubmitted(false);
  }, [isOpen, stock]);

  const u = parseUnits(unitsText), a = parseRupees(avg), c = parseRupees(cur), iso = partsToISO(date);
  const errors = {
    name: !name.trim() ? "Enter the company name." : null,
    ticker: !ticker.trim() ? "Enter the ticker, for example RELIANCE." : null,
    units: !u ? "Enter units more than 0." : null,
    avg: !a ? "Enter the average buy price." : null,
    cur: !c ? "Enter the current price." : null,
    date: !iso ? "Enter a real date." : iso > todayISO() ? "Purchase date can't be in the future." : null,
  };
  const save = useSave(async () => {
    const input = { name: name.trim(), ticker: ticker.trim(), exchange, units: u!, avgPrice: a!, currentPrice: c!, purchaseDate: iso! };
    return editing ? api.investments.updateStock(stock!.id, input) : api.investments.createStock(input);
  });
  const err = (k: keyof typeof errors) => (submitted ? errors[k] : null);

  return (
    <FormDialog
      title={editing ? "Edit stock" : "Add stock"}
      isOpen={isOpen}
      onClose={onClose}
      submitLabel={editing ? "Save changes" : "Add stock"}
      onSubmit={async () => {
        setSubmitted(true);
        if (Object.values(errors).some(Boolean)) throw { message: "Please fix the highlighted fields." };
        await save.mutateAsync(undefined);
        toast(editing ? "Stock updated." : "Stock added.");
      }}
    >
      <CalcPreview invested={u && a ? Math.round(u * a) : 0} current={u && c ? Math.round(u * c) : 0} />
      <TextInput label="Holding" value={name} onChange={setName} placeholder="e.g. Reliance Industries" required maxLength={80} error={err("name")} autoFocus />
      <div className="field-row">
        <TextInput label="Ticker" value={ticker} onChange={(v) => setTicker(v.toUpperCase())} placeholder="e.g. RELIANCE" required maxLength={20} error={err("ticker")} />
        <SelectField label="Exchange" value={exchange} onChange={setExchange} options={[{ id: "NSE", label: "NSE" }, { id: "BSE", label: "BSE" }]} required />
      </div>
      <div className="field-row">
        <TextInput label="Units" value={unitsText} onChange={setUnits} placeholder="0" required inputMode="decimal" error={err("units")} />
        <AmountInput label="Average buy price" value={avg} onChange={setAvg} placeholder="0.00" required error={err("avg")} />
      </div>
      <div className="field-row">
        <AmountInput label="Current price" value={cur} onChange={setCur} placeholder="0.00" required error={err("cur")} />
        <DateInput label="Purchase date" value={date} onChange={setDate} required error={err("date")} />
      </div>
      <p className="dialog__note">Invested = units × buy price. Current value = units × current price.</p>
    </FormDialog>
  );
}

function FundDialog({ isOpen, onClose, fund }: { isOpen: boolean; onClose: () => void; fund?: Fund }) {
  const toast = useToast();
  const editing = !!fund;
  const [name, setName] = useState("");
  const [plan, setPlan] = useState("Direct · Growth");
  const [sip, setSip] = useState("");
  const [sipDay, setSipDay] = useState("");
  const [start, setStart] = useState<DateParts>(partsFromISO(todayISO()));
  const [unitsText, setUnits] = useState("");
  const [avg, setAvg] = useState("");
  const [cur, setCur] = useState("");
  const [submitted, setSubmitted] = useState(false);
  useEffect(() => {
    if (!isOpen) return;
    setName(fund?.name ?? "");
    setPlan(fund?.plan ?? "Direct · Growth");
    setSip(fund ? paiseToInput(fund.sipAmount) : "");
    setSipDay(fund ? String(fund.sipDay) : "");
    setStart(partsFromISO(fund?.sipStart ?? todayISO()));
    setUnits(fund ? String(fund.units) : "");
    setAvg(fund ? paiseToInput(fund.avgNav) : "");
    setCur(fund ? paiseToInput(fund.currentNav) : "");
    setSubmitted(false);
  }, [isOpen, fund]);

  const u = parseUnits(unitsText), a = parseRupees(avg), c = parseRupees(cur), s = sip.trim() ? parseRupees(sip) : 0, day = Number(sipDay), iso = partsToISO(start);
  const errors = {
    name: !name.trim() ? "Enter the fund name." : null,
    sip: s == null ? "Enter the monthly SIP amount, or 0 for none." : null,
    day: !(Number.isInteger(day) && day >= 1 && day <= 28) ? "Enter a day from 1 to 28." : null,
    start: !iso ? "Enter a real start date." : null,
    units: !u ? "Enter units more than 0." : null,
    avg: !a ? "Enter the average buy NAV." : null,
    cur: !c ? "Enter the current NAV." : null,
  };
  const save = useSave(async () => {
    const input = { name: name.trim(), plan: plan.trim() || "Direct · Growth", units: u!, avgNav: a!, currentNav: c!, sipAmount: s ?? 0, sipDay: day, sipStart: iso! };
    return editing ? api.investments.updateFund(fund!.id, input) : api.investments.createFund(input);
  });
  const err = (k: keyof typeof errors) => (submitted ? errors[k] : null);

  return (
    <FormDialog
      title={editing ? "Edit mutual fund & SIP" : "Add mutual fund"}
      subtitle={editing ? undefined : "Track a fund holding and set its monthly SIP schedule."}
      isOpen={isOpen}
      onClose={onClose}
      submitLabel={editing ? "Save changes" : "Add mutual fund"}
      onSubmit={async () => {
        setSubmitted(true);
        if (Object.values(errors).some(Boolean)) throw { message: "Please fix the highlighted fields." };
        await save.mutateAsync(undefined);
        toast(editing ? "Fund updated." : "Fund added.");
      }}
    >
      <CalcPreview invested={u && a ? Math.round(u * a) : 0} current={u && c ? Math.round(u * c) : 0} />
      <div className="field-row">
        <TextInput label="Fund name" value={name} onChange={setName} placeholder="e.g. HDFC Flexi Cap Fund" required maxLength={80} error={err("name")} autoFocus />
        <TextInput label="Plan" value={plan} onChange={setPlan} placeholder="Direct · Growth" maxLength={40} />
      </div>
      <div className="field-row">
        <AmountInput label="Monthly SIP amount" value={sip} onChange={setSip} placeholder="0" error={err("sip")} />
        <TextInput label="SIP day (1–28)" value={sipDay} onChange={(v) => setSipDay(v.replace(/\D/g, "").slice(0, 2))} placeholder="e.g. 5" required inputMode="numeric" error={err("day")} />
      </div>
      <div className="field-row">
        <DateInput label="SIP start date" value={start} onChange={setStart} required error={err("start")} />
        <TextInput label="Total units held" value={unitsText} onChange={setUnits} placeholder="0" required inputMode="decimal" error={err("units")} />
      </div>
      <div className="field-row">
        <AmountInput label="Average buy NAV" value={avg} onChange={setAvg} placeholder="0.00" required error={err("avg")} />
        <AmountInput label="Current NAV" value={cur} onChange={setCur} placeholder="0.00" required error={err("cur")} />
      </div>
      <p className="dialog__note">Returns are absolute, not annualized. A SIP schedule tracks contributions; it does not place orders.</p>
    </FormDialog>
  );
}
