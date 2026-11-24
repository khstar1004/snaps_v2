"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import styles from "@/styles/personal-v1.module.css";

type AppLayoutProps = {
  children: ReactNode;
};

type NavIconName = "dashboard" | "production" | "library" | "settings";

type NavItem = {
  href: string;
  label: string;
  icon: NavIconName;
  matches: (pathname: string) => boolean;
};

const NAV_ITEMS: NavItem[] = [
  {
    href: "/home",
    label: "대시보드",
    icon: "dashboard",
    matches: (pathname) => pathname === "/" || pathname === "/home",
  },
  {
    href: "/shorts-json-studio?mode=onboarding",
    label: "제작",
    icon: "production",
    matches: (pathname) =>
      pathname.startsWith("/shorts-json-studio") ||
      pathname.startsWith("/projects/new") ||
      pathname.startsWith("/layout-studio"),
  },
  {
    href: "/assets",
    label: "라이브러리",
    icon: "library",
    matches: (pathname) =>
      pathname === "/assets" ||
      pathname.startsWith("/assets/") ||
      ((pathname === "/projects" || pathname.startsWith("/projects/")) && !pathname.startsWith("/projects/new")),
  },
  {
    href: "/settings",
    label: "설정",
    icon: "settings",
    matches: (pathname) =>
      pathname === "/settings" || pathname.startsWith("/settings/") || pathname.startsWith("/channel-categories"),
  },
];

function NavIcon({ name }: { name: NavIconName }) {
  if (name === "dashboard") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" />
      </svg>
    );
  }
  if (name === "production") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 3h10a2 2 0 0 1 2 2v3l3-2v12l-3-2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm4 5v8l6-4-6-4Z" />
      </svg>
    );
  }
  if (name === "library") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 4h6l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm0 4v10h16V8H4Z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M10.4 2h3.2l.5 2.2c.5.2 1 .5 1.4.8l2.1-.7 1.6 2.8-1.6 1.5c.1.5.1.9 0 1.4l1.6 1.5-1.6 2.8-2.1-.7c-.4.3-.9.6-1.4.8l-.5 2.2h-3.2l-.5-2.2c-.5-.2-1-.5-1.4-.8l-2.1.7-1.6-2.8L6.4 10a6 6 0 0 1 0-1.4L4.8 7.1l1.6-2.8 2.1.7c.4-.3.9-.6 1.4-.8L10.4 2Zm1.6 5a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z" />
    </svg>
  );
}

export function AppLayout({ children }: AppLayoutProps) {
  const pathname = usePathname() || "/";
  const isProductionWorkspace =
    pathname.startsWith("/shorts-json-studio") || pathname.startsWith("/layout-studio");

  return (
    <div className={styles.appShell}>
      <aside className={styles.sidebar}>
        <div className={styles.brandBlock}>
          <Link href="/home" className={styles.brand} aria-label="숏메이커 대시보드로 이동">
            숏메이커
          </Link>
        </div>

        <nav className={styles.sidebarNav} aria-label="주요 메뉴">
          {NAV_ITEMS.map((item) => {
            const active = item.matches(pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`${styles.navLink} ${active ? styles.navLinkActive : ""}`}
                aria-current={active ? "page" : undefined}
              >
                <span className={styles.navIcon}>
                  <NavIcon name={item.icon} />
                </span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

      </aside>

      <main className={`${styles.main} ${isProductionWorkspace ? styles.mainWide : ""}`}>{children}</main>
    </div>
  );
}
