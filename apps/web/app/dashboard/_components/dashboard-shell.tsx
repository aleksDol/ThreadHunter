"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import Button from "../../../components/ui/button";
import { apiFetch } from "../../../src/lib/api-client";
import { cn } from "../../../src/lib/cn";

const navItems = [
  { href: "/dashboard/comments", label: "Комментарии" },
  { href: "/dashboard/accounts", label: "Аккаунты" },
  { href: "/dashboard/channels", label: "Каналы" },
  { href: "/dashboard/knowledge", label: "AI Context" },
  { href: "/dashboard/billing", label: "Оплата" }
] as const;

const titleMap: Record<string, string> = {
  "/dashboard": "Обзор",
  "/dashboard/comments": "Комментарии",
  "/dashboard/accounts": "Аккаунты",
  "/dashboard/channels": "Каналы",
  "/dashboard/knowledge": "AI Context",
  "/dashboard/billing": "Оплата и лимиты",
  "/dashboard/settings": "Настройки"
};

type MeResponse = {
  user: { firstName: string | null; username: string | null };
};

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [userLabel, setUserLabel] = useState("Пользователь");

  useEffect(() => {
    apiFetch<MeResponse>("/auth/me")
      .then((res) => {
        setUserLabel(res.user.firstName || res.user.username || "Пользователь");
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
      <div className="mx-auto grid min-h-screen max-w-[1440px] grid-cols-1 lg:grid-cols-[260px_1fr]">
        <aside className="border-r border-slate-200 bg-slate-900 px-6 py-8 text-slate-100">
          <div className="mb-8">
            <div className="text-2xl font-semibold leading-tight">Экспертный комментарий ИИ</div>
          </div>
          <nav className="space-y-2">
            {navItems.map((item) => {
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
