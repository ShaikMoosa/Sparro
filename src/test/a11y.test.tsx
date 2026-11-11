/**
 * Every page is rendered (with the in-memory mock backend) and scanned with axe
 * for WCAG 2.x A/AA violations, both with sample data and on a first run.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { beforeEach, describe, expect, it } from "vitest";
import { axe } from "vitest-axe";

import { resetMock } from "../api/mock";
import { Layout } from "../components/Layout";
import { ToastProvider } from "../components/ui";
import { AccountsPage } from "../pages/Accounts";
import { CategoriesPage } from "../pages/Categories";
import { DashboardPage } from "../pages/Dashboard";
import { ExpensesPage } from "../pages/Expenses";
import { InvestmentsPage } from "../pages/Investments";
import { SettingsPage } from "../pages/Settings";
import { SubscriptionsPage } from "../pages/Subscriptions";

const pages: [string, string, ReactNode, RegExp][] = [
  ["Dashboard", "/", <DashboardPage />, /Budget against limits/],
  ["Expenses", "/expenses", <ExpensesPage />, /Search/],
  ["Accounts", "/accounts", <AccountsPage />, /Account breakdown/],
  ["Investments", "/investments", <InvestmentsPage />, /Stock holdings/],
  ["Subscriptions", "/subscriptions", <SubscriptionsPage />, /Monthly cost/],
  ["Categories", "/categories", <CategoriesPage />, /Essentials and regular commitments/],
  ["Settings", "/settings", <SettingsPage />, /Budget rules/],
];

function renderAt(path: string, element: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter([{ element: <Layout />, children: [{ path, element }] }], { initialEntries: [path] });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

// Colour contrast is checked against the Figma tokens instead: jsdom cannot compute styles.
const axeOptions = { rules: { "color-contrast": { enabled: false } } };

describe.each([
  ["with sample data", false],
  ["on first run", true],
])("accessibility %s", (_label, empty) => {
  beforeEach(() => resetMock(empty));

  it.each(pages)("%s has no axe violations", async (_name, path, element, ready) => {
    const { container } = renderAt(path, element);
    await waitFor(() => expect(screen.getAllByText(ready).length).toBeGreaterThan(0));
    const results = await axe(container, axeOptions);
    expect(results).toHaveNoViolations();
  });
});

describe("empty states", () => {
  beforeEach(() => resetMock(true));

  it("Accounts explains what to do first", async () => {
    renderAt("/accounts", <AccountsPage />);
    expect(await screen.findByText("No accounts yet")).toBeInTheDocument();
    // One in the page header, one inside the empty state.
    expect(screen.getAllByRole("button", { name: "Add account" })).toHaveLength(2);
  });

  it("Dashboard shows a prompt instead of zeros", async () => {
    renderAt("/", <DashboardPage />);
    expect(await screen.findByText("No transactions yet")).toBeInTheDocument();
    expect(screen.getByText("Nothing renews this week")).toBeInTheDocument();
  });
});
