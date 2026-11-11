import { useMemo, useState } from "react";
import { Input, Label, TextField } from "react-aria-components";

import { api, useAccounts, useCategories, useExpenses, useSave } from "../api";
import type { Bucket } from "../bindings/Bucket";
import type { Expense } from "../bindings/Expense";
import type { ExpenseFilter } from "../bindings/ExpenseFilter";
import { BucketBadge, Button, CategoryInitial, ConfirmDelete, EmptyState, FilterSelect, PageHeader, RowActions, useToast } from "../components/ui";
import { BUCKETS, BUCKET_LABEL } from "../lib/colors";
import { currentMonth, dayMonth, longDate, monthName, plural, rupees } from "../lib/format";
import { errorMessage } from "../api/client";
import { CSV_FILTER, chooseSavePath, fileName } from "../lib/files";
import { ExpenseDialog } from "./ExpenseDialog";

type Filters = { search: string; bucket: Bucket | "all"; categoryId: number | "all"; accountId: number | "all"; from: string; to: string };
const EMPTY: Filters = { search: "", bucket: "all", categoryId: "all", accountId: "all", from: "", to: "" };

export function ExpensesPage() {
  const toast = useToast();
  const month = currentMonth();
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<Expense | null>(null);
  const { data: categories = [] } = useCategories();
  const { data: accounts = [] } = useAccounts();

  const query: ExpenseFilter = useMemo(
    () => ({
      month,
      search: filters.search || undefined,
      bucket: filters.bucket === "all" ? undefined : filters.bucket,
      categoryId: filters.categoryId === "all" ? undefined : filters.categoryId,
      accountId: filters.accountId === "all" ? undefined : filters.accountId,
      from: filters.from || undefined,
      to: filters.to || undefined,
    }),
    [filters, month],
  );
  const rangeError = filters.from && filters.to && filters.from > filters.to ? "From date must be on or before To date." : null;
  const { data: expenses = [], isLoading, error } = useExpenses(rangeError ? { ...query, from: undefined, to: undefined } : query);
  const unfiltered = useExpenses({ month });
  const filtered = JSON.stringify(filters) !== JSON.stringify(EMPTY);
  const total = expenses.reduce((s, e) => s + e.amount, 0);
  const remove = useSave((id: number) => api.expenses.remove(id));
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => setFilters((f) => ({ ...f, [k]: v }));
  const [exporting, setExporting] = useState(false);

  // SYS-05: export exactly what the current filters show.
  async function exportCsv() {
    const range = filters.from || filters.to ? `${filters.from || "start"}-to-${filters.to || "today"}` : month;
    const path = await chooseSavePath(`sparro-expenses-${range}.csv`, [CSV_FILTER]);
    if (!path) return;
    setExporting(true);
    try {
      const count = await api.data.exportExpenses(rangeError ? { ...query, from: undefined, to: undefined } : query, path);
      toast(`Exported ${plural(count, "expense")} to ${fileName(path)}.`);
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setExporting(false);
    }
  }

  const heading =
    filters.from || filters.to
      ? `${filters.from ? longDate(filters.from) : "Start"} – ${filters.to ? longDate(filters.to) : "today"}`
      : monthName(month, true);
  const meta = filtered
    ? `${expenses.length} of ${plural(unfiltered.data?.length ?? 0, "entry", "entries")} match · ${rupees(total)}`
    : `Total amount : ${rupees(total)}`;

  return (
    <div className="page">
      <PageHeader
        title="Expenses"
        description="Log daily spending and review every entry. Balances update automatically."
        actions={
          <>
            <Button onPress={exportCsv} isDisabled={exporting || expenses.length === 0}>
              Export CSV
            </Button>
            <Button emphasis onPress={() => setAdding(true)}>
              Add expense
            </Button>
          </>
        }
      />

      <section className="card filters" aria-label="Filter expenses">
        <TextField className="filter filter--grow" value={filters.search} onChange={(v) => set("search", v)}>
          <Label className="filter__label">Search</Label>
          <Input className="filter__control" placeholder="Description" type="search" />
        </TextField>
        <FilterSelect
          label="Bucket"
          value={filters.bucket}
          onChange={(v) => set("bucket", v)}
          options={[{ id: "all", label: "All buckets" }, ...BUCKETS.map((b) => ({ id: b, label: BUCKET_LABEL[b] }))]}
        />
        <FilterSelect
          label="Category"
          value={filters.categoryId}
          onChange={(v) => set("categoryId", v)}
          options={[{ id: "all", label: "All categories" }, ...categories.map((c) => ({ id: c.id, label: c.name }))]}
        />
        <FilterSelect
          label="Account"
          value={filters.accountId}
          onChange={(v) => set("accountId", v)}
          options={[{ id: "all", label: "All accounts" }, ...accounts.map((a) => ({ id: a.id, label: a.name }))]}
        />
        <label className="filter">
          <span className="filter__label">From</span>
          <input className="filter__control" type="date" value={filters.from} onChange={(e) => set("from", e.target.value)} aria-invalid={!!rangeError || undefined} />
        </label>
        <label className="filter">
          <span className="filter__label">To</span>
          <input className="filter__control" type="date" value={filters.to} onChange={(e) => set("to", e.target.value)} aria-invalid={!!rangeError || undefined} />
        </label>
        <Button size="s" onPress={() => setFilters(EMPTY)} isDisabled={!filtered}>
          Clear
        </Button>
      </section>
      {rangeError && (
        <p className="field__error" role="alert">
          {rangeError}
        </p>
      )}

      <section className="card table-card" aria-labelledby="expenses-heading">
        <div className="table-card__head">
          <h2 id="expenses-heading">{heading}</h2>
          <span className="table-card__meta" aria-live="polite">
            {meta}
          </span>
        </div>
        {isLoading ? (
          <p className="loading">Loading expenses…</p>
        ) : error ? (
          <p className="loading">Couldn't load expenses.</p>
        ) : expenses.length === 0 ? (
          filtered ? (
            <EmptyState title="No expenses match your filters" hint="Try a different search, bucket, category, account or date range." actionLabel="Clear filters" onAction={() => setFilters(EMPTY)} />
          ) : (
            <EmptyState
              title={`No expenses in ${monthName(month)}`}
              hint="Log your first purchase this month. Balances and budget bars update as you add entries."
              actionLabel="Add expense"
              onAction={() => setAdding(true)}
            />
          )
        ) : (
          <table className="table">
            <caption className="visually-hidden">Expenses, newest first</caption>
            <colgroup>
              <col />
              <col style={{ width: 156 }} />
              <col style={{ width: 64 }} />
              <col style={{ width: 156 }} />
              <col style={{ width: 98 }} />
              <col style={{ width: 88 }} />
              <col style={{ width: 87 }} />
            </colgroup>
            <thead>
              <tr>
                <th scope="col">Description</th>
                <th scope="col">Category</th>
                <th scope="col">Date</th>
                <th scope="col">Account</th>
                <th scope="col">Bucket</th>
                <th scope="col" className="col-amount" style={{ fontWeight: 400, color: "var(--text-table-header)" }}>
                  Amount
                </th>
                <th scope="col">
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((e) => (
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
                  <td>{e.accountName}</td>
                  <td>
                    <BucketBadge bucket={e.bucket} />
                  </td>
                  <td className="col-amount">{rupees(e.amount)}</td>
                  <td>
                    <RowActions label={e.description} onEdit={() => setEditing(e)} onDelete={() => setDeleting(e)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <ExpenseDialog isOpen={adding || !!editing} expense={editing} onClose={() => (setAdding(false), setEditing(null))} />
      {deleting && (
        <ConfirmDelete
          isOpen
          title="Delete this expense?"
          description={`This removes the entry from your expenses and adds ${rupees(deleting.amount)} back to ${deleting.accountName}.`}
          summaryTitle={deleting.description}
          summaryDetail={`${rupees(deleting.amount)} · ${deleting.categoryName} · ${BUCKET_LABEL[deleting.bucket]} · ${deleting.accountName} · ${longDate(deleting.date)}`}
          confirmLabel="Delete expense"
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            await remove.mutateAsync(deleting.id);
            toast("Expense deleted.");
          }}
        />
      )}
    </div>
  );
}
