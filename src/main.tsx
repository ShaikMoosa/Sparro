import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import { createHashRouter, RouterProvider } from "react-router";

import { queryClient } from "./api";
import { Layout } from "./components/Layout";
import { ToastProvider } from "./components/ui";
import { AccountsPage } from "./pages/Accounts";
import { CategoriesPage } from "./pages/Categories";
import { DashboardPage } from "./pages/Dashboard";
import { ExpensesPage } from "./pages/Expenses";
import { InvestmentsPage } from "./pages/Investments";
import { SettingsPage } from "./pages/Settings";
import { SubscriptionsPage } from "./pages/Subscriptions";
import "./styles/base.css";
import "./styles/components.css";
import "./styles/pages.css";

// Hash routing works from the packaged app's file origin without a server.
const router = createHashRouter([
  {
    element: <Layout />,
    children: [
      { path: "/", element: <DashboardPage /> },
      { path: "/expenses", element: <ExpensesPage /> },
      { path: "/accounts", element: <AccountsPage /> },
      { path: "/investments", element: <InvestmentsPage /> },
      { path: "/subscriptions", element: <SubscriptionsPage /> },
      { path: "/categories", element: <CategoriesPage /> },
      { path: "/settings", element: <SettingsPage /> },
    ],
  },
]);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
);
