import { CalendarSync, CreditCard, FileChartColumn, House, PiggyBank, Settings, Sprout, type LucideIcon } from "lucide-react";
import { useEffect, useRef } from "react";
import { NavLink, Outlet, useLocation } from "react-router";

import logo from "../assets/figma/logo-mark.png";

const NAV: { to: string; label: string; icon: LucideIcon; title: string }[] = [
  { to: "/", label: "Dashboard", icon: House, title: "Dashboard" },
  { to: "/expenses", label: "Expense", icon: PiggyBank, title: "Expenses" },
  { to: "/accounts", label: "Accounts", icon: CreditCard, title: "Accounts" },
  { to: "/investments", label: "Investments", icon: Sprout, title: "Investments" },
  { to: "/subscriptions", label: "Subscription", icon: CalendarSync, title: "Subscriptions" },
  { to: "/categories", label: "Categories", icon: FileChartColumn, title: "Categories" },
  { to: "/settings", label: "Settings", icon: Settings, title: "Settings" },
];

export function Layout() {
  const location = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  const first = useRef(true);

  // Announce page changes: update the window title and move focus to the page.
  useEffect(() => {
    const item = NAV.find((n) => (n.to === "/" ? location.pathname === "/" : location.pathname.startsWith(n.to)));
    document.title = item ? `${item.title} · Sparro` : "Sparro";
    if (first.current) {
      first.current = false;
      return;
    }
    mainRef.current?.focus();
  }, [location.pathname]);

  return (
    <div className="app">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <aside className="sidebar">
        <div className="sidebar__brand">
          <img className="sidebar__logo" src={logo} alt="" width={27} height={25} />
          <span>Sparro</span>
        </div>
        <nav className="sidebar__nav" aria-label="Main">
          <ul>
            {NAV.map(({ to, label, icon: Icon }) => (
              <li key={to}>
                <NavLink to={to} end={to === "/"} className="nav-link">
                  <Icon size={20} strokeWidth={1.75} aria-hidden />
                  {label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </aside>
      <main id="main" className="main" ref={mainRef} tabIndex={-1} style={{ outline: "none" }}>
        <Outlet />
      </main>
    </div>
  );
}
