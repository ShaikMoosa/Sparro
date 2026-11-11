import { useEffect, useState } from "react";

import { api, useAccounts, useSave } from "../api";
import type { Account } from "../bindings/Account";
import type { AccountKind } from "../bindings/AccountKind";
import type { Income } from "../bindings/Income";
import type { Transfer } from "../bindings/Transfer";
import {
  AmountInput,
  ConfirmDelete,
  DateInput,
  FormDialog,
  SelectField,
  TextInput,
  partsFromISO,
  partsToISO,
  useToast,
  type DateParts,
} from "../components/ui";
import { paiseToInput, parseRupees, plural, rupees, todayISO } from "../lib/format";

export const KIND_LABEL: Record<AccountKind, string> = {
  savings: "Savings",
  current: "Current",
  cash: "Cash",
  credit_card: "Credit card",
};
const KINDS = (Object.keys(KIND_LABEL) as AccountKind[]).map((k) => ({ id: k, label: KIND_LABEL[k] }));

/** Signed amounts are allowed here: a credit card usually opens below zero. */
function parseSigned(v: string): number | null {
  const neg = /^\s*[-−]/.test(v);
  const p = parseRupees(v.replace(/^\s*[-−]/, ""));
  return p == null ? null : neg ? -p : p;
}

export function AccountDialog({ isOpen, onClose, account }: { isOpen: boolean; onClose: () => void; account?: Account | null }) {
  const toast = useToast();
  const editing = !!account;
  const [name, setName] = useState("");
  const [kind, setKind] = useState<AccountKind | null>(null);
  const [amount, setAmount] = useState("");
  const [submitted, setSubmitted] = useState(false);
  useEffect(() => {
    if (!isOpen) return;
    setName(account?.name ?? "");
    setKind(account?.kind ?? null);
    setAmount(account ? (account.openingBalance < 0 ? "-" : "") + paiseToInput(Math.abs(account.openingBalance)) : "");
    setSubmitted(false);
  }, [isOpen, account]);

  const paise = parseSigned(amount);
  const errors = {
    name: !name.trim() ? "Enter an account name." : null,
    kind: !kind ? "Choose an account type." : null,
    amount: paise == null ? "Enter the current balance, for example 25000." : null,
  };
  const save = useSave(async () => {
    const input = { name: name.trim(), kind: kind!, openingBalance: paise! };
    return editing ? api.accounts.update(account!.id, input) : api.accounts.create(input);
  });

  return (
    <FormDialog
      title={editing ? "Edit account" : "Add account"}
      isOpen={isOpen}
      onClose={onClose}
      submitLabel={editing ? "Save changes" : "Add account"}
      onSubmit={async () => {
        setSubmitted(true);
        if (Object.values(errors).some(Boolean)) throw { message: "Please fix the highlighted fields." };
        await save.mutateAsync(undefined);
        toast(editing ? "Account updated." : "Account added.");
      }}
    >
      <TextInput label="Account name" value={name} onChange={setName} placeholder="Eg: HDFC Bank" required maxLength={60} error={submitted ? errors.name : null} autoFocus />
      <SelectField label="Account Type" value={kind} onChange={setKind} options={KINDS} placeholder="Select account type" required error={submitted ? errors.kind : null} />
      <AmountInput
        label={editing ? "Opening balance" : "Amount"}
        value={amount}
        onChange={setAmount}
        required
        error={submitted ? errors.amount : null}
        hint={kind === "credit_card" ? "Enter money you owe as a negative amount, for example -12000." : "The balance in this account today."}
      />
    </FormDialog>
  );
}

export function DeleteAccountDialog({ account, onClose }: { account: Account; onClose: () => void }) {
  const toast = useToast();
  const { data: accounts = [] } = useAccounts();
  const others = accounts.filter((a) => a.id !== account.id);
  const [moveTo, setMoveTo] = useState<number | null>(others[0]?.id ?? null);
  const needsMove = account.entryCount > 0;
  const remove = useSave(() => api.accounts.remove(account.id, needsMove ? moveTo : null));
  const blocked = needsMove && others.length === 0;

  return (
    <ConfirmDelete
      isOpen
      title="Delete this account?"
      description="This removes the account from Sparro. It does not close your account with the bank."
      summaryTitle={account.name}
      summaryDetail={`${KIND_LABEL[account.kind]} · Balance ${rupees(account.balance)} · ${plural(account.entryCount, "linked entry", "linked entries")}`}
      confirmLabel="Delete account"
      canConfirm={!blocked && (!needsMove || moveTo != null)}
      onClose={onClose}
      onConfirm={async () => {
        await remove.mutateAsync(undefined);
        toast(`${account.name} deleted.`);
      }}
    >
      {needsMove &&
        (blocked ? (
          <p className="dialog__note">Add another account first so this account's entries have somewhere to move.</p>
        ) : (
          <>
            <SelectField label="Move transactions to" value={moveTo} onChange={setMoveTo} options={others.map((a) => ({ id: a.id, label: a.name }))} required />
            <p className="dialog__note">
              Expenses, income, transfers and subscriptions linked to {account.name} move to the chosen account. Amounts and dates stay unchanged.
            </p>
          </>
        ))}
    </ConfirmDelete>
  );
}

export function IncomeDialog({ isOpen, onClose, income }: { isOpen: boolean; onClose: () => void; income?: Income | null }) {
  const toast = useToast();
  const { data: accounts = [] } = useAccounts();
  const editing = !!income;
  const [name, setName] = useState("");
  const [accountId, setAccountId] = useState<number | null>(null);
  const [date, setDate] = useState<DateParts>(partsFromISO(todayISO()));
  const [amount, setAmount] = useState("");
  const [submitted, setSubmitted] = useState(false);
  useEffect(() => {
    if (!isOpen) return;
    setName(income?.name ?? "");
    setAccountId(income?.accountId ?? null);
    setDate(partsFromISO(income?.date ?? todayISO()));
    setAmount(income ? paiseToInput(income.amount) : "");
    setSubmitted(false);
  }, [isOpen, income]);

  const iso = partsToISO(date);
  const paise = parseRupees(amount);
  const errors = {
    name: !name.trim() ? "Enter an income name." : null,
    account: accountId == null ? "Choose an account." : null,
    date: !iso ? "Enter a real date." : null,
    amount: !paise ? "Enter an amount more than ₹0." : null,
  };
  const save = useSave(async () => {
    const input = { name: name.trim(), accountId: accountId!, date: iso!, amount: paise! };
    return editing ? api.incomes.update(income!.id, input) : api.incomes.create(input);
  });

  return (
    <FormDialog
      title={editing ? "Edit income" : "Income"}
      isOpen={isOpen}
      onClose={onClose}
      submitLabel={editing ? "Save changes" : "Log income"}
      onSubmit={async () => {
        setSubmitted(true);
        if (Object.values(errors).some(Boolean)) throw { message: "Please fix the highlighted fields." };
        await save.mutateAsync(undefined);
        toast(editing ? "Income updated." : "Income logged.");
      }}
    >
      <TextInput label="Income name" value={name} onChange={setName} placeholder="Eg: Salary" required maxLength={60} error={submitted ? errors.name : null} autoFocus />
      <SelectField label="Account" value={accountId} onChange={setAccountId} options={accounts.map((a) => ({ id: a.id, label: a.name }))} placeholder="Select account" required error={submitted ? errors.account : null} />
      <DateInput label="Date" value={date} onChange={setDate} required error={submitted ? errors.date : null} />
      <AmountInput label="Amount" value={amount} onChange={setAmount} required error={submitted ? errors.amount : null} />
    </FormDialog>
  );
}

export function TransferDialog({ isOpen, onClose, transfer }: { isOpen: boolean; onClose: () => void; transfer?: Transfer | null }) {
  const toast = useToast();
  const { data: accounts = [] } = useAccounts();
  const editing = !!transfer;
  const [from, setFrom] = useState<number | null>(null);
  const [to, setTo] = useState<number | null>(null);
  const [date, setDate] = useState<DateParts>(partsFromISO(todayISO()));
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [submitted, setSubmitted] = useState(false);
  useEffect(() => {
    if (!isOpen) return;
    setFrom(transfer?.fromAccountId ?? null);
    setTo(transfer?.toAccountId ?? null);
    setDate(partsFromISO(transfer?.date ?? todayISO()));
    setAmount(transfer ? paiseToInput(transfer.amount) : "");
    setNote(transfer?.note ?? "");
    setSubmitted(false);
  }, [isOpen, transfer]);

  const iso = partsToISO(date);
  const paise = parseRupees(amount);
  const errors = {
    from: from == null ? "Choose the account money leaves." : null,
    to: to == null ? "Choose the account money goes to." : from != null && from === to ? "From and To accounts must be different." : null,
    date: !iso ? "Enter a real date." : null,
    amount: !paise ? "Enter an amount more than ₹0." : null,
  };
  const fromAcc = accounts.find((a) => a.id === from);
  const toAcc = accounts.find((a) => a.id === to);
  // When editing, undo this transfer before previewing the new one.
  const base = (a: Account | undefined) =>
    !a ? 0 : !transfer ? a.balance : a.balance + (a.id === transfer.fromAccountId ? transfer.amount : 0) - (a.id === transfer.toAccountId ? transfer.amount : 0);
  const overdrawn = fromAcc && paise && fromAcc.kind !== "credit_card" && base(fromAcc) - paise < 0;
  const save = useSave(async () => {
    const input = { fromAccountId: from!, toAccountId: to!, date: iso!, amount: paise!, note: note.trim() };
    return editing ? api.transfers.update(transfer!.id, input) : api.transfers.create(input);
  });

  return (
    <FormDialog
      title={editing ? "Edit transfer" : "Transfer between accounts"}
      isOpen={isOpen}
      onClose={onClose}
      submitLabel={editing ? "Save changes" : "Transfer"}
      onSubmit={async () => {
        setSubmitted(true);
        if (Object.values(errors).some(Boolean)) throw { message: "Please fix the highlighted fields." };
        await save.mutateAsync(undefined);
        toast(editing ? "Transfer updated." : "Transfer recorded.");
      }}
    >
      <SelectField label="From account" value={from} onChange={setFrom} options={accounts.map((a) => ({ id: a.id, label: a.name }))} placeholder="Select account" required error={submitted ? errors.from : null} />
      <SelectField label="To account" value={to} onChange={setTo} options={accounts.map((a) => ({ id: a.id, label: a.name }))} placeholder="Select account" required error={submitted || (from != null && from === to) ? errors.to : null} />
      <DateInput label="Date" value={date} onChange={setDate} required error={submitted ? errors.date : null} />
      <AmountInput label="Amount" value={amount} onChange={setAmount} required error={submitted ? errors.amount : null} />
      <TextInput label="Note (optional)" value={note} onChange={setNote} placeholder="Eg: ATM withdrawal" maxLength={80} />
      <div className="summary-box" aria-live="polite">
        <strong>Balances after transfer</strong>
        {fromAcc && toAcc && paise && from !== to ? (
          <>
            <span>
              {fromAcc.name}: {rupees(base(fromAcc))} → {rupees(base(fromAcc) - paise)}
            </span>
            <span>
              {toAcc.name}: {rupees(base(toAcc))} → {rupees(base(toAcc) + paise)}
            </span>
          </>
        ) : (
          <span>Choose both accounts and an amount to see the new balances.</span>
        )}
        {overdrawn && <span className="text-danger">This is more than the {fromAcc!.name} balance.</span>}
        <span>Transfers move money between your accounts. They don’t count as income or spending.</span>
      </div>
    </FormDialog>
  );
}
