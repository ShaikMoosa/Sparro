import { QueryClient, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { Account } from "../bindings/Account";
import type { AccountInput } from "../bindings/AccountInput";
import type { Category } from "../bindings/Category";
import type { CategoryInput } from "../bindings/CategoryInput";
import type { Dashboard } from "../bindings/Dashboard";
import type { Expense } from "../bindings/Expense";
import type { ExpenseFilter } from "../bindings/ExpenseFilter";
import type { ExpenseInput } from "../bindings/ExpenseInput";
import type { Fund } from "../bindings/Fund";
import type { FundInput } from "../bindings/FundInput";
import type { Income } from "../bindings/Income";
import type { IncomeInput } from "../bindings/IncomeInput";
import type { Portfolio } from "../bindings/Portfolio";
import type { Settings } from "../bindings/Settings";
import type { Stock } from "../bindings/Stock";
import type { StockInput } from "../bindings/StockInput";
import type { Subscription } from "../bindings/Subscription";
import type { SubscriptionInput } from "../bindings/SubscriptionInput";
import type { Transfer } from "../bindings/Transfer";
import type { TransferInput } from "../bindings/TransferInput";
import { call } from "./client";

export const api = {
  accounts: {
    list: () => call<Account[]>("list_accounts"),
    create: (input: AccountInput) => call<Account>("create_account", { input }),
    update: (id: number, input: AccountInput) => call<Account>("update_account", { id, input }),
    remove: (id: number, moveTo: number | null) => call<void>("delete_account", { id, moveTo }),
  },
  categories: {
    list: () => call<Category[]>("list_categories"),
    create: (input: CategoryInput) => call<Category>("create_category", { input }),
    update: (id: number, input: CategoryInput) => call<Category>("update_category", { id, input }),
    remove: (id: number, replacement: number | null) => call<void>("delete_category", { id, replacement }),
  },
  expenses: {
    list: (filter: ExpenseFilter) => call<Expense[]>("list_expenses", { filter }),
    create: (input: ExpenseInput) => call<Expense>("create_expense", { input }),
    update: (id: number, input: ExpenseInput) => call<Expense>("update_expense", { id, input }),
    remove: (id: number) => call<void>("delete_expense", { id }),
  },
  incomes: {
    list: (month: string) => call<Income[]>("list_incomes", { month }),
    create: (input: IncomeInput) => call<Income>("create_income", { input }),
    update: (id: number, input: IncomeInput) => call<Income>("update_income", { id, input }),
    remove: (id: number) => call<void>("delete_income", { id }),
  },
  transfers: {
    list: (month: string) => call<Transfer[]>("list_transfers", { month }),
    create: (input: TransferInput) => call<Transfer>("create_transfer", { input }),
    update: (id: number, input: TransferInput) => call<Transfer>("update_transfer", { id, input }),
    remove: (id: number) => call<void>("delete_transfer", { id }),
  },
  subscriptions: {
    list: () => call<Subscription[]>("list_subscriptions"),
    create: (input: SubscriptionInput) => call<Subscription>("create_subscription", { input }),
    update: (id: number, input: SubscriptionInput) => call<Subscription>("update_subscription", { id, input }),
    remove: (id: number) => call<void>("delete_subscription", { id }),
    pay: (id: number) => call<Subscription>("pay_subscription", { id }),
  },
  investments: {
    portfolio: () => call<Portfolio>("get_portfolio"),
    createStock: (input: StockInput) => call<Stock>("create_stock", { input }),
    updateStock: (id: number, input: StockInput) => call<Stock>("update_stock", { id, input }),
    removeStock: (id: number) => call<void>("delete_stock", { id }),
    createFund: (input: FundInput) => call<Fund>("create_fund", { input }),
    updateFund: (id: number, input: FundInput) => call<Fund>("update_fund", { id, input }),
    removeFund: (id: number) => call<void>("delete_fund", { id }),
  },
  settings: {
    get: () => call<Settings>("get_settings"),
    save: (input: Settings) => call<Settings>("save_settings", { input }),
  },
  dashboard: (month: string) => call<Dashboard>("get_dashboard", { month }),
  data: {
    backup: (path: string) => call<void>("backup_database", { path }),
    restore: (path: string) => call<void>("restore_database", { path }),
    exportExpenses: (filter: ExpenseFilter, path: string) => call<number>("export_expenses", { filter, path }),
  },
};

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: false },
    mutations: { retry: false },
  },
});

export const useAccounts = () => useQuery({ queryKey: ["accounts"], queryFn: api.accounts.list });
export const useCategories = () => useQuery({ queryKey: ["categories"], queryFn: api.categories.list });
export const useExpenses = (filter: ExpenseFilter) =>
  useQuery({ queryKey: ["expenses", filter], queryFn: () => api.expenses.list(filter), placeholderData: (prev) => prev });
export const useIncomes = (month: string) => useQuery({ queryKey: ["incomes", month], queryFn: () => api.incomes.list(month) });
export const useTransfers = (month: string) =>
  useQuery({ queryKey: ["transfers", month], queryFn: () => api.transfers.list(month) });
export const useSubscriptions = () => useQuery({ queryKey: ["subscriptions"], queryFn: api.subscriptions.list });
export const usePortfolio = () => useQuery({ queryKey: ["portfolio"], queryFn: api.investments.portfolio });
export const useSettings = () => useQuery({ queryKey: ["settings"], queryFn: api.settings.get });
export const useDashboard = (month: string) =>
  useQuery({ queryKey: ["dashboard", month], queryFn: () => api.dashboard(month), placeholderData: (prev) => prev });

/**
 * A mutation that refreshes every query on success: a single entry can change
 * balances, budget bars, renewals and the dashboard at once.
 */
export function useSave<TArgs, TResult>(fn: (args: TArgs) => Promise<TResult>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => qc.invalidateQueries() });
}
