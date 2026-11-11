import { Pencil, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button as AriaButton, Radio, RadioGroup } from "react-aria-components";

import { api, useAccounts, useCategories, useSave, useSubscriptions } from "../api";
import type { Bucket } from "../bindings/Bucket";
import type { Cycle } from "../bindings/Cycle";
import type { Subscription } from "../bindings/Subscription";
import type { SubscriptionStatus } from "../bindings/SubscriptionStatus";
import {
  AmountInput,
  BucketBadge,
  Button,
  ConfirmDelete,
  DateInput,
  EmptyState,
  FormDialog,
  PageHeader,
  SelectField,
  TextInput,
  partsFromISO,
  partsToISO,
  useToast,
  type DateParts,
} from "../components/ui";
import { BUCKETS, BUCKET_LABEL } from "../lib/colors";
import { addMonthsISO, longDate, paiseToInput, parseRupees, rupees, todayISO } from "../lib/format";

const CYCLE_LABEL: Record<Cycle, string> = { monthly: "Monthly", quarterly: "Quarterly", yearly: "Yearly" };
const CYCLE_MONTHS: Record<Cycle, number> = { monthly: 1, quarterly: 3, yearly: 12 };
const STATUS_LABEL: Record<SubscriptionStatus, string> = { active: "Active", paused: "Paused", cancelled: "Cancelled" };
type Filter = "all" | SubscriptionStatus;

export function SubscriptionsPage() {
  const toast = useToast();
  const { data: subs = [], isLoading } = useSubscriptions();
  const [filter, setFilter] = useState<Filter>("all");
  const [dialog, setDialog] = useState<{ open: boolean; sub?: Subscription }>({ open: false });
  const [paying, setPaying] = useState<Subscription | null>(null);
  const [deleting, setDeleting] = useState<Subscription | null>(null);
  const remove = useSave((id: number) => api.subscriptions.remove(id));
  const pay = useSave((id: number) => api.subscriptions.pay(id));

  const active = subs.filter((s) => s.status === "active");
  const count = (s: SubscriptionStatus) => subs.filter((x) => x.status === s).length;
  const monthly = active.reduce((s, x) => s + x.monthlyCost, 0);
  const yearly = active.reduce((s, x) => s + x.yearlyCost, 0);
  const shown = filter === "all" ? subs : subs.filter((s) => s.status === filter);

  return (
    <div className="page">
      <PageHeader title="Subscriptions" description="Manage recurring payments and upcoming renewals." />
      <div className="metrics metrics--3">
        <div className="metric metric--lg">
          <span className="metric__label">Monthly cost</span>
          <span className="metric__value num">{rupees(monthly, { decimals: 2 })}</span>
          <span className="metric__caption">Active plans · Monthly equivalent</span>
        </div>
        <div className="metric metric--lg">
          <span className="metric__label">Yearly cost</span>
          <span className="metric__value num">{rupees(yearly, { decimals: 0 })}</span>
          <span className="metric__caption">Projected annual cost · Active plans</span>
        </div>
        <div className="metric metric--lg">
          <span className="metric__label">Active subscriptions</span>
          <span className="metric__value num">{active.length}</span>
          <span className="metric__caption">
            {subs.length} total · {count("paused")} paused · {count("cancelled")} cancelled
          </span>
        </div>
      </div>

      <div className="toolbar">
        <RadioGroup className="segmented" aria-label="Show subscriptions" orientation="horizontal" value={filter} onChange={(v) => setFilter(v as Filter)}>
          <Radio className="segmented__item" value="all">All {subs.length}</Radio>
          <Radio className="segmented__item" value="active">Active {active.length}</Radio>
          <Radio className="segmented__item" value="paused">Paused {count("paused")}</Radio>
          <Radio className="segmented__item" value="cancelled">Cancelled {count("cancelled")}</Radio>
        </RadioGroup>
        <Button variant="primary" size="l" onPress={() => setDialog({ open: true })}>
          Add subscription
        </Button>
      </div>

      {isLoading ? (
        <p className="loading">Loading subscriptions…</p>
      ) : shown.length === 0 ? (
        <div className="card card--panel">
          {subs.length === 0 ? (
            <EmptyState
              title="No subscriptions yet"
              hint="Add Netflix, Spotify or any recurring plan to see monthly and yearly costs and get renewal reminders on the Dashboard."
              actionLabel="Add subscription"
              onAction={() => setDialog({ open: true })}
            />
          ) : (
            <EmptyState title={`No ${STATUS_LABEL[filter as SubscriptionStatus].toLowerCase()} subscriptions`} hint="Choose another filter to see your other plans." />
          )}
        </div>
      ) : (
        <ul className="sub-grid" aria-label="Subscriptions">
          {shown.map((s) => (
            <li key={s.id} className="card card--panel sub-card">
              <div className="sub-card__head">
                <h2>{s.name}</h2>
                <AriaButton className="icon-btn icon-btn--lg" aria-label={`Edit ${s.name}`} onPress={() => setDialog({ open: true, sub: s })}>
                  <Pencil size={16} aria-hidden />
                </AriaButton>
                <AriaButton className="icon-btn icon-btn--lg icon-btn--danger" aria-label={`Delete ${s.name}`} onPress={() => setDeleting(s)}>
                  <Trash2 size={16} aria-hidden />
                </AriaButton>
              </div>
              <div className="sub-card__price">
                <div>
                  <span className="sub-card__amount num">{rupees(s.amount)}</span>
                  <span className="sub-card__caption">Billed {CYCLE_LABEL[s.cycle].toLowerCase()}</span>
                </div>
                <div className="sub-card__per-month">
                  <span className="sub-card__caption">Per month</span>
                  <span className="num">{rupees(s.monthlyCost, { decimals: 2 })}</span>
                </div>
              </div>
              <dl className="sub-card__details">
                <dt>Category</dt>
                <dd>{s.categoryName}</dd>
                <dt>Bucket</dt>
                <dd>
                  <BucketBadge bucket={s.bucket} />
                </dd>
                <dt>Cycle</dt>
                <dd>{CYCLE_LABEL[s.cycle]}</dd>
                <dt>Renews at</dt>
                <dd>{s.status === "cancelled" ? "—" : `${longDate(s.renewsOn)}${s.status === "paused" ? " · Paused" : ""}`}</dd>
                <dt>Paid from</dt>
                <dd>{s.accountName}</dd>
                <dt>Status</dt>
                <dd>
                  <span className={`badge status--${s.status}`}>{STATUS_LABEL[s.status]}</span>
                </dd>
              </dl>
              <Button
                variant={s.status === "active" ? "primary" : "secondary"}
                size="l"
                className="sub-card__pay"
                isDisabled={s.status !== "active"}
                onPress={() => setPaying(s)}
              >
                Pay now<span className="visually-hidden"> for {s.name}</span>
              </Button>
            </li>
          ))}
        </ul>
      )}

      <SubscriptionDialog isOpen={dialog.open} sub={dialog.sub} onClose={() => setDialog({ open: false })} />
      {paying && (
        <FormDialog
          isOpen
          title={`Pay ${paying.name}`}
          onClose={() => setPaying(null)}
          submitLabel="Record payment"
          cancelLabel="Cancel"
          onSubmit={async () => {
            await pay.mutateAsync(paying.id);
            toast(`Payment recorded. ${paying.name} now renews on ${longDate(addMonthsISO(paying.renewsOn, CYCLE_MONTHS[paying.cycle]))}.`);
          }}
        >
          <div className="summary-box">
            <strong>
              {paying.name} · {CYCLE_LABEL[paying.cycle]}
            </strong>
            <span>
              {paying.categoryName} · {BUCKET_LABEL[paying.bucket]} · paid from {paying.accountName}
            </span>
          </div>
          <dl className="calc-grid">
            <div>
              <dt>Amount due</dt>
              <dd>{rupees(paying.amount)}</dd>
            </div>
            <div>
              <dt>Current renewal</dt>
              <dd>{longDate(paying.renewsOn)}</dd>
            </div>
            <div>
              <dt>Next renewal after payment</dt>
              <dd>{longDate(addMonthsISO(paying.renewsOn, CYCLE_MONTHS[paying.cycle]))}</dd>
            </div>
          </dl>
          <p className="dialog__note">
            Recording a payment logs a {rupees(paying.amount)} expense dated today and updates the renewal date. It does not transfer money to the provider.
          </p>
        </FormDialog>
      )}
      {deleting && (
        <ConfirmDelete
          isOpen
          title="Delete this subscription?"
          description="Remove this subscription and its future reminders. Past payments will remain in your expenses."
          summaryTitle={deleting.name}
          summaryDetail={`${rupees(deleting.amount)} / ${CYCLE_LABEL[deleting.cycle].toLowerCase()} · ${deleting.categoryName} · ${BUCKET_LABEL[deleting.bucket]} · ${STATUS_LABEL[deleting.status]}${
            deleting.status !== "cancelled" ? ` · Next renewal ${longDate(deleting.renewsOn)}` : ""
          }`}
          warning="This cannot be undone. Deleting here does not cancel your subscription with the provider."
          confirmLabel="Delete subscription"
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            await remove.mutateAsync(deleting.id);
            toast(`${deleting.name} deleted.`);
          }}
        />
      )}
    </div>
  );
}

function SubscriptionDialog({ isOpen, onClose, sub }: { isOpen: boolean; onClose: () => void; sub?: Subscription }) {
  const toast = useToast();
  const { data: categories = [] } = useCategories();
  const { data: accounts = [] } = useAccounts();
  const editing = !!sub;
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [bucket, setBucket] = useState<Bucket | null>(null);
  const [cycle, setCycle] = useState<Cycle | null>(null);
  const [amount, setAmount] = useState("");
  const [renews, setRenews] = useState<DateParts>(partsFromISO(""));
  const [accountId, setAccountId] = useState<number | null>(null);
  const [status, setStatus] = useState<SubscriptionStatus>("active");
  const [submitted, setSubmitted] = useState(false);
  useEffect(() => {
    if (!isOpen) return;
    setName(sub?.name ?? "");
    setCategoryId(sub?.categoryId ?? null);
    setBucket(sub?.bucket ?? null);
    setCycle(sub?.cycle ?? null);
    setAmount(sub ? paiseToInput(sub.amount) : "");
    setRenews(partsFromISO(sub?.renewsOn ?? addMonthsISO(todayISO(), 1)));
    setAccountId(sub?.accountId ?? null);
    setStatus(sub?.status ?? "active");
    setSubmitted(false);
  }, [isOpen, sub]);

  const iso = partsToISO(renews);
  const paise = parseRupees(amount);
  const perMonth = paise && cycle ? Math.round(paise / CYCLE_MONTHS[cycle]) : 0;
  const perYear = paise && cycle ? Math.round((paise * 12) / CYCLE_MONTHS[cycle]) : 0;
  const errors = {
    name: !name.trim() ? "Enter a subscription name." : null,
    category: categoryId == null ? "Choose a category." : null,
    bucket: !bucket ? "Choose a bucket." : null,
    cycle: !cycle ? "Choose a billing cycle." : null,
    amount: !paise ? "Enter the amount charged each cycle." : null,
    renews: !iso ? "Enter a real renewal date." : null,
    account: accountId == null ? "Choose the account it's paid from." : null,
  };
  const save = useSave(async () => {
    const input = { name: name.trim(), categoryId: categoryId!, bucket: bucket!, cycle: cycle!, amount: paise!, renewsOn: iso!, accountId: accountId!, status };
    return editing ? api.subscriptions.update(sub!.id, input) : api.subscriptions.create(input);
  });
  const err = (k: keyof typeof errors) => (submitted ? errors[k] : null);

  return (
    <FormDialog
      title={editing ? "Edit subscription" : "Add subscription"}
      isOpen={isOpen}
      onClose={onClose}
      cancelLabel="Cancel"
      submitLabel={editing ? "Save changes" : "Add subscription"}
      onSubmit={async () => {
        setSubmitted(true);
        if (Object.values(errors).some(Boolean)) throw { message: "Please fix the highlighted fields." };
        await save.mutateAsync(undefined);
        toast(editing ? "Subscription updated." : "Subscription added.");
      }}
    >
      <dl className="calc-grid calc-grid--2" aria-live="polite">
        <div>
          <dt>Per month cost</dt>
          <dd>{rupees(perMonth, { decimals: 2 })}</dd>
        </div>
        <div>
          <dt>Per year cost</dt>
          <dd>{rupees(perYear, { decimals: 2 })}</dd>
        </div>
      </dl>
      <TextInput label="Subscription name" value={name} onChange={setName} placeholder="Eg: Netflix Premium" required maxLength={60} error={err("name")} autoFocus />
      <div className="field-row">
        <SelectField
          label="Category"
          value={categoryId}
          onChange={(id) => {
            setCategoryId(id);
            const c = categories.find((x) => x.id === id);
            if (c) setBucket(c.bucket);
          }}
          options={categories.map((c) => ({ id: c.id, label: c.name, section: BUCKET_LABEL[c.bucket] }))}
          placeholder="Select category"
          required
          error={err("category")}
        />
        <SelectField label="Bucket" value={bucket} onChange={setBucket} options={BUCKETS.map((b) => ({ id: b, label: BUCKET_LABEL[b] }))} placeholder="Select bucket" required error={err("bucket")} />
      </div>
      <div className="field-row">
        <SelectField
          label="Billing cycle"
          value={cycle}
          onChange={setCycle}
          options={(Object.keys(CYCLE_LABEL) as Cycle[]).map((c) => ({ id: c, label: CYCLE_LABEL[c] }))}
          placeholder="Select cycle"
          required
          error={err("cycle")}
        />
        <AmountInput label="Amount per cycle" value={amount} onChange={setAmount} required error={err("amount")} />
      </div>
      <DateInput label="Renews at" value={renews} onChange={setRenews} required error={err("renews")} />
      <div className="field-row">
        <SelectField label="Paid from" value={accountId} onChange={setAccountId} options={accounts.map((a) => ({ id: a.id, label: a.name }))} placeholder="Select account" required error={err("account")} />
        <SelectField
          label="Status"
          value={status}
          onChange={setStatus}
          options={(Object.keys(STATUS_LABEL) as SubscriptionStatus[]).map((s) => ({ id: s, label: STATUS_LABEL[s] }))}
          required
        />
      </div>
      <p className="dialog__note">
        Monthly equivalent: monthly amount, quarterly ÷ 3, yearly ÷ 12. Paused and cancelled plans are excluded from summary costs and renewals.
      </p>
    </FormDialog>
  );
}
