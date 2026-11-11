import { useState } from "react";

import { api, useAccounts, useIncomes, useSave, useTransfers } from "../api";
import type { Account } from "../bindings/Account";
import type { Income } from "../bindings/Income";
import type { Transfer } from "../bindings/Transfer";
import { Button, ConfirmDelete, EmptyState, MonthSwitcher, PageHeader, RowActions, useToast } from "../components/ui";
import { currentMonth, dayMonth, longDate, monthName, plural, rupees } from "../lib/format";
import { AccountDialog, DeleteAccountDialog, IncomeDialog, KIND_LABEL, TransferDialog } from "./AccountDialogs";

export function AccountsPage() {
  const toast = useToast();
  const [month, setMonth] = useState(currentMonth());
  const { data: accounts = [], isLoading } = useAccounts();
  const { data: incomes = [] } = useIncomes(month);
  const { data: transfers = [] } = useTransfers(month);
  const [accountDialog, setAccountDialog] = useState<{ open: boolean; account?: Account }>({ open: false });
  const [deletingAccount, setDeletingAccount] = useState<Account | null>(null);
  const [incomeDialog, setIncomeDialog] = useState<{ open: boolean; income?: Income }>({ open: false });
  const [deletingIncome, setDeletingIncome] = useState<Income | null>(null);
  const [transferDialog, setTransferDialog] = useState<{ open: boolean; transfer?: Transfer }>({ open: false });
  const [deletingTransfer, setDeletingTransfer] = useState<Transfer | null>(null);
  const removeIncome = useSave((id: number) => api.incomes.remove(id));
  const removeTransfer = useSave((id: number) => api.transfers.remove(id));

  const total = accounts.reduce((s, a) => s + a.balance, 0);
  const banks = accounts.filter((a) => a.kind === "savings" || a.kind === "current").reduce((s, a) => s + a.balance, 0);
  const positiveTotal = accounts.reduce((s, a) => s + Math.max(0, a.balance), 0);
  const incomeTotal = incomes.reduce((s, i) => s + i.amount, 0);
  const transferTotal = transfers.reduce((s, t) => s + t.amount, 0);
  const hasAccounts = accounts.length > 0;

  return (
    <div className="page">
      <PageHeader title="Account" description="Balances update automatically when you log income and expenses" />

      <div className="accounts-summary">
        <div className="metrics metrics--2">
          <div className="metric">
            <span className="metric__label">Total net balance</span>
            <span className="metric__value num">{rupees(total)}</span>
            <span className="metric__caption">Across {plural(accounts.length, "account")}</span>
          </div>
          <div className="metric">
            <span className="metric__label">Bank balances</span>
            <span className="metric__value num">{rupees(banks)}</span>
            <span className="metric__caption">Savings and current accounts</span>
          </div>
        </div>
        <Button emphasis onPress={() => setAccountDialog({ open: true })}>
          Add account
        </Button>
      </div>

      <section className="card account-breakdown" aria-labelledby="breakdown-heading">
        <h2 id="breakdown-heading" className="account-breakdown__title">
          Account breakdown
        </h2>
        {isLoading ? (
          <p className="loading">Loading accounts…</p>
        ) : !hasAccounts ? (
          <EmptyState title="No accounts yet" hint="Add your bank accounts and cash in hand with their current balances to start tracking." actionLabel="Add account" onAction={() => setAccountDialog({ open: true })} />
        ) : (
          <ul className="account-list">
            {accounts.map((a) => {
              const share = positiveTotal > 0 ? Math.round((Math.max(0, a.balance) / positiveTotal) * 100) : 0;
              return (
                <li key={a.id} className="account-row">
                  <span className="account-row__initial" aria-hidden>
                    {a.name.charAt(0).toUpperCase()}
                  </span>
                  <span className="account-row__identity">
                    <span className="account-row__name">{a.name}</span>
                    <span className="badge badge--type">{KIND_LABEL[a.kind]}</span>
                  </span>
                  <span className="account-row__share">
                    <span className="account-row__pct">{share}% of total</span>
                    <span className="share-bar" role="img" aria-label={`${share}% of total balance`}>
                      <span style={{ width: `${share}%` }} />
                    </span>
                  </span>
                  <span className="account-row__balance num">{rupees(a.balance)}</span>
                  <RowActions label={a.name} onEdit={() => setAccountDialog({ open: true, account: a })} onDelete={() => setDeletingAccount(a)} />
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div className="toolbar">
        <MonthSwitcher month={month} onChange={setMonth} />
        <div className="toolbar__actions">
          <Button onPress={() => setTransferDialog({ open: true })} isDisabled={accounts.length < 2}>
            Transfer
          </Button>
          <Button onPress={() => setIncomeDialog({ open: true })} isDisabled={!hasAccounts}>
            log income
          </Button>
        </div>
      </div>

      <section className="card table-card" aria-labelledby="income-heading">
        <h2 id="income-heading" className="visually-hidden">
          Income in {monthName(month, true)}
        </h2>
        {incomes.length === 0 ? (
          <EmptyState
            title={`No income logged for ${monthName(month)}`}
            hint="Use log income to add your salary or other income. Budget limits on the Dashboard are set from this month’s income."
            actionLabel={hasAccounts ? "Log income" : undefined}
            onAction={() => setIncomeDialog({ open: true })}
          />
        ) : (
          <>
            <table className="table">
              <colgroup>
                <col style={{ width: 172 }} />
                <col style={{ width: 64 }} />
                <col />
                <col style={{ width: 110 }} />
                <col style={{ width: 87 }} />
              </colgroup>
              <thead>
                <tr>
                  <th scope="col">Income</th>
                  <th scope="col">Date</th>
                  <th scope="col">Account</th>
                  <th scope="col" className="col-amount" style={{ fontWeight: 400, color: "var(--text-table-header)" }}>
                    Amount
                  </th>
                  <th scope="col">
                    <span className="visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {incomes.map((i) => (
                  <tr key={i.id}>
                    <td>{i.name}</td>
                    <td>
                      <time dateTime={i.date}>{dayMonth(i.date)}</time>
                    </td>
                    <td>{i.accountName}</td>
                    <td className="col-amount">{rupees(i.amount)}</td>
                    <td>
                      <RowActions label={`${i.name} on ${longDate(i.date)}`} onEdit={() => setIncomeDialog({ open: true, income: i })} onDelete={() => setDeletingIncome(i)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="table-card__foot">Total amount : {rupees(incomeTotal)}</div>
          </>
        )}
      </section>

      <h2 className="section-title" id="transfers-heading">
        Transfers
      </h2>
      <section className="card table-card" aria-labelledby="transfers-heading">
        {transfers.length === 0 ? (
          <EmptyState
            title={`No transfers in ${monthName(month)}`}
            hint="Use Transfer to move money between your accounts, for example an ATM withdrawal to Cash in hand."
            actionLabel={accounts.length >= 2 ? "Transfer" : undefined}
            onAction={() => setTransferDialog({ open: true })}
          />
        ) : (
          <>
            <table className="table">
              <colgroup>
                <col style={{ width: 220 }} />
                <col style={{ width: 64 }} />
                <col />
                <col style={{ width: 110 }} />
                <col style={{ width: 87 }} />
              </colgroup>
              <thead>
                <tr>
                  <th scope="col">Transfer</th>
                  <th scope="col">Date</th>
                  <th scope="col">Note</th>
                  <th scope="col" className="col-amount" style={{ fontWeight: 400, color: "var(--text-table-header)" }}>
                    Amount
                  </th>
                  <th scope="col">
                    <span className="visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {transfers.map((t) => (
                  <tr key={t.id}>
                    <td>
                      {t.fromAccountName} <span aria-hidden>→</span>
                      <span className="visually-hidden"> to </span> {t.toAccountName}
                    </td>
                    <td>
                      <time dateTime={t.date}>{dayMonth(t.date)}</time>
                    </td>
                    <td>{t.note || "—"}</td>
                    <td className="col-amount">{rupees(t.amount)}</td>
                    <td>
                      <RowActions
                        label={`transfer from ${t.fromAccountName} to ${t.toAccountName} on ${longDate(t.date)}`}
                        onEdit={() => setTransferDialog({ open: true, transfer: t })}
                        onDelete={() => setDeletingTransfer(t)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="table-card__foot">
              {plural(transfers.length, "transfer")} · {rupees(transferTotal)} moved
            </div>
          </>
        )}
      </section>

      <AccountDialog isOpen={accountDialog.open} account={accountDialog.account} onClose={() => setAccountDialog({ open: false })} />
      {deletingAccount && <DeleteAccountDialog account={deletingAccount} onClose={() => setDeletingAccount(null)} />}
      <IncomeDialog isOpen={incomeDialog.open} income={incomeDialog.income} onClose={() => setIncomeDialog({ open: false })} />
      <TransferDialog isOpen={transferDialog.open} transfer={transferDialog.transfer} onClose={() => setTransferDialog({ open: false })} />
      {deletingIncome && (
        <ConfirmDelete
          isOpen
          title="Delete this income?"
          description={`This removes the entry and takes ${rupees(deletingIncome.amount)} back out of ${deletingIncome.accountName}. Budget limits for the month are recalculated.`}
          summaryTitle={deletingIncome.name}
          summaryDetail={`${rupees(deletingIncome.amount)} · ${deletingIncome.accountName} · ${longDate(deletingIncome.date)}`}
          confirmLabel="Delete income"
          onClose={() => setDeletingIncome(null)}
          onConfirm={async () => {
            await removeIncome.mutateAsync(deletingIncome.id);
            toast("Income deleted.");
          }}
        />
      )}
      {deletingTransfer && (
        <ConfirmDelete
          isOpen
          title="Delete this transfer?"
          description={`Both balances go back: ${rupees(deletingTransfer.amount)} returns to ${deletingTransfer.fromAccountName}.`}
          summaryTitle={`${deletingTransfer.fromAccountName} → ${deletingTransfer.toAccountName}`}
          summaryDetail={`${rupees(deletingTransfer.amount)} · ${longDate(deletingTransfer.date)}${deletingTransfer.note ? ` · ${deletingTransfer.note}` : ""}`}
          confirmLabel="Delete transfer"
          onClose={() => setDeletingTransfer(null)}
          onConfirm={async () => {
            await removeTransfer.mutateAsync(deletingTransfer.id);
            toast("Transfer deleted.");
          }}
        />
      )}
    </div>
  );
}
