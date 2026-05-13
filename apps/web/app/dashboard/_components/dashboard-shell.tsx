"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import Button from "../../../components/ui/button";
import { apiFetch } from "../../../src/lib/api-client";
import { cn } from "../../../src/lib/cn";

const navItems: Array<{ href: Route; label: string; adminOnly?: boolean }> = [
  { href: "/dashboard/comments", label: "Комментарии" },
  { href: "/dashboard/accounts", label: "Аккаунты" },
  { href: "/dashboard/channels", label: "Каналы" },
  { href: "/dashboard/knowledge", label: "AI Context" },
  { href: "/dashboard/billing", label: "Оплата" },
  { href: "/dashboard/admin", label: "Админка", adminOnly: true }
];

const titleMap: Record<string, string> = {
  "/dashboard": "Обзор",
  "/dashboard/comments": "Комментарии",
  "/dashboard/accounts": "Аккаунты",
  "/dashboard/channels": "Каналы",
  "/dashboard/knowledge": "AI Context",
  "/dashboard/billing": "Оплата и лимиты",
  "/dashboard/admin": "Админка",
  "/dashboard/settings": "Настройки"
};

type MeResponse = {
  user: { firstName: string | null; username: string | null; isAdmin: boolean };
};

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [userLabel, setUserLabel] = useState("Пользователь");
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    apiFetch<MeResponse>("/auth/me")
      .then((res) => {
        setUserLabel(res.user.firstName || res.user.username || "Пользователь");
        setIsAdmin(res.user.isAdmin);
      })
      .catch(() => undefined);
  }, []);

  const pageTitle = useMemo(() => titleMap[pathname] || "Dashboard", [pathname]);

  async function onLogout() {
    await apiFetch<{ ok: true }>("/auth/logout", { method: "POST" });
    router.replace("/login");
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <aside className="hidden lg:block lg:fixed lg:inset-y-0 lg:left-0 lg:w-[260px] lg:overflow-y-auto border-r border-slate-200 bg-slate-900 px-6 py-8 text-slate-100">
        <div className="mb-8">
          <div className="text-2xl font-semibold leading-tight">Экспертный комментарий ИИ</div>
        </div>
        <nav className="space-y-2">
          {navItems.map((item) => {
            if (item.adminOnly && !isAdmin) {
              return null;
            }
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "block rounded-2xl px-4 py-2 text-sm transition",
                  active ? "bg-slate-100 text-slate-900" : "text-slate-200 hover:bg-slate-800"
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="mx-auto min-h-screen w-full max-w-[1440px] lg:pl-[260px]">
        <aside className="border-r border-slate-200 bg-slate-900 px-6 py-8 text-slate-100 lg:hidden">
          <div className="mb-8">
            <div className="text-2xl font-semibold leading-tight">Экспертный комментарий ИИ</div>
          </div>
          <nav className="space-y-2">
            {navItems.map((item) => {
              if (item.adminOnly && !isAdmin) {
                return null;
              }
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "block rounded-2xl px-4 py-2 text-sm transition",
                    active ? "bg-slate-100 text-slate-900" : "text-slate-200 hover:bg-slate-800"
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </aside>
        <div className="flex min-w-0 flex-col">
          <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
            <h1 className="text-2xl font-semibold">{pageTitle}</h1>
            <div className="flex items-center gap-3">
              <span className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700">{userLabel}</span>
              <Button variant="secondary" onClick={onLogout}>Выйти</Button>
            </div>
          </header>
          <main className="p-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
