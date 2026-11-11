import { useEffect, useMemo, useState } from "react";

import { api, useAccounts, useCategories, useSave, useSubscriptions } from "../api";
import type { Bucket } from "../bindings/Bucket";
import type { Cycle } from "../bindings/Cycle";
import type { Expense } from "../bindings/Expense";
import type { ExpenseInput } from "../bindings/ExpenseInput";
import {
  AmountInput,
  DateInput,
  FormDialog,
  SelectField,
  TextInput,
  Toggle,
  partsFromISO,
  partsToISO,
  useToast,
  type DateParts,
} from "../components/ui";
import { BUCKETS, BUCKET_LABEL } from "../lib/colors";
import { addMonthsISO, longDate, paiseToInput, parseRupees, rupees, todayISO } from "../lib/format";

const CYCLES: { id: Cycle; label: string }[] = [
  { id: "monthly", label: "Monthly" },
  { id: "quarterly", label: "Quarterly" },
  { id: "yearly", label: "Yearly" },
];
const CYCLE_MONTHS: Record<Cycle, number> = { monthly: 1, quarterly: 3, yearly: 12 };
const NEW = "new" as const;

type Props = { isOpen: boolean; onClose: () => void; expense?: Expense | null };

export function ExpenseDialog({ isOpen, onClose, expense }: Props) {
  const toast = useToast();
  const { data: categories = [] } = useCategories();
  const { data: accounts = [] } = useAccounts();
  const { data: subscriptions = [] } = useSubscriptions();
  const editing = !!expense;

  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [accountId, setAccountId] = useState<number | null>(null);
  const [bucket, setBucket] = useState<Bucket | null>(null);
  const [date, setDate] = useState<DateParts>(partsFromISO(todayISO()));
  const [amount, setAmount] = useState("");
  const [subscriber, setSubscriber] = useState(false);
  const [subChoice, setSubChoice] = useState<number | typeof NEW | null>(null);
  const [cycle, setCycle] = useState<Cycle>("monthly");
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setDescription(expense?.description ?? "");
    setCategoryId(expense?.categoryId ?? null);
    setAccountId(expense?.accountId ?? null);
    setBucket(expense?.bucket ?? null);
    setDate(partsFromISO(expense?.date ?? todayISO()));
    setAmount(expense ? paiseToInput(expense.amount) : "");
    setSubscriber(!!expense?.subscriptionId);
    setSubChoice(expense?.subscriptionId ?? null);
    setCycle("monthly");
    setSubmitted(false);
  }, [isOpen, expense]);

  // Pick the category's bucket automatically (EXP-02); the user can still override it.
  function chooseCategory(id: number) {
    setCategoryId(id);
    const c = categories.find((x) => x.id === id);
    if (c) setBucket(c.bucket);
  }

  const activeSubs = subscriptions.filter((s) => s.status === "active" || s.id === expense?.subscriptionId);
  const matchingSub = activeSubs.find((s) => s.name.trim().toLowerCase() === description.trim().toLowerCase());

  // Suggest the existing subscription when the description matches one.
  useEffect(() => {
    if (subscriber && subChoice == null && !editing) setSubChoice(matchingSub ? matchingSub.id : NEW);
  }, [subscriber, subChoice, matchingSub, editing]);

  const isoDate = partsToISO(date);
  const paise = parseRupees(amount);
  const errors = {
    description: !description.trim() ? "Enter a description." : null,
    category: categoryId == null ? "Choose a category." : null,
    account: accountId == null ? "Choose an account." : null,
    bucket: bucket == null ? "Choose a bucket." : null,
    date: !isoDate ? "Enter a real date, for example 18 / 11 / 2026." : null,
    amount: paise == null ? "Enter an amount, for example 649." : paise <= 0 ? "Amount must be more than ₹0." : null,
    subscription: subscriber && subChoice == null ? "Choose a subscription or create a new one." : null,
  };
  const show = (k: keyof typeof errors) => (submitted ? errors[k] : null);

  const save = useSave(async (input: ExpenseInput) => (editing ? api.expenses.update(expense!.id, input) : api.expenses.create(input)));

  async function submit() {
    setSubmitted(true);
    if (Object.values(errors).some(Boolean)) throw { message: "Please fix the highlighted fields." };
    const input: ExpenseInput = {
      description: description.trim(),
      categoryId: categoryId!,
      accountId: accountId!,
      bucket: bucket!,
      date: isoDate!,
      amount: paise!,
      subscription: !subscriber
        ? undefined
        : subChoice === NEW
          ? editing
            ? undefined
            : { kind: "new", cycle }
          : { kind: "existing", id: subChoice as number },
    };
    await save.mutateAsync(input);
    toast(editing ? "Expense updated." : "Expense added.");
  }

  const categoryOptions = useMemo(
    () => categories.map((c) => ({ id: c.id, label: c.name, section: BUCKET_LABEL[c.bucket] })),
    [categories],
  );
  const subOptions = [
    ...(editing ? [] : [{ id: NEW as number | typeof NEW, label: `+ Create new${description.trim() ? `: ${description.trim()}` : ""}` }]),
    ...activeSubs.map((s) => ({ id: s.id as number | typeof NEW, label: s.name })),
  ];

  const newSummary = (() => {
    if (!subscriber || subChoice !== NEW || editing) return null;
    const cat = categories.find((c) => c.id === categoryId);
    const acc = accounts.find((a) => a.id === accountId);
    const next = isoDate ? longDate(addMonthsISO(isoDate, CYCLE_MONTHS[cycle])) : "one cycle after the expense date";
    return {
      title: description.trim() ? `No subscription named "${description.trim()}" yet` : "A new subscription will be created",
      detail: `Sparro will create an active ${cycle} subscription: ${paise ? rupees(paise) : "₹—"} · ${cat?.name ?? "category"} · ${
        bucket ? BUCKET_LABEL[bucket] : "bucket"
      } · paid from ${acc?.name ?? "account"}. Next renewal ${next}.`,
    };
  })();
  const linked = subscriber && typeof subChoice === "number" ? activeSubs.find((s) => s.id === subChoice) : null;

  return (
    <FormDialog
      title={editing ? "Edit expense" : "Add Expenses"}
      isOpen={isOpen}
      onClose={onClose}
      onSubmit={submit}
      submitLabel={editing ? "Save changes" : "Add expense"}
    >
      <TextInput label="Description" value={description} onChange={setDescription} placeholder="Enter description" required maxLength={80} error={show("description")} autoFocus />
      <SelectField label="Category" value={categoryId} onChange={chooseCategory} options={categoryOptions} placeholder="Select category" required error={show("category")} />
      <SelectField
        label="Account"
        value={accountId}
        onChange={setAccountId}
        options={accounts.map((a) => ({ id: a.id, label: a.name }))}
        placeholder={accounts.length ? "Select account" : "Add an account first"}
        required
        error={show("account")}
      />
      <SelectField label="Bucket" value={bucket} onChange={setBucket} options={BUCKETS.map((b) => ({ id: b, label: BUCKET_LABEL[b] }))} placeholder="Select bucket" required error={show("bucket")} />
      <DateInput label="Date" value={date} onChange={setDate} required error={show("date")} />
      <AmountInput label="Amount" value={amount} onChange={setAmount} required error={show("amount")} />
      <Toggle label="Subscriber" isSelected={subscriber} onChange={setSubscriber} />
      {subscriber && (
        <>
          <SelectField label="Subscription" value={subChoice} onChange={setSubChoice} options={subOptions} placeholder="Select subscription" required error={show("subscription")} />
          {subChoice === NEW && !editing && (
            <SelectField label="Billing cycle" value={cycle} onChange={setCycle} options={CYCLES} required />
          )}
          {newSummary && (
            <div className="summary-box" aria-live="polite">
              <strong>{newSummary.title}</strong>
              <span>{newSummary.detail}</span>
            </div>
          )}
          {linked && !editing && (
            <div className="summary-box" aria-live="polite">
              <strong>Linked to {linked.name}</strong>
              <span>Its next renewal moves from {longDate(linked.renewsOn)} to {longDate(addMonthsISO(linked.renewsOn, CYCLE_MONTHS[linked.cycle]))}.</span>
            </div>
          )}
        </>
      )}
    </FormDialog>
  );
}
