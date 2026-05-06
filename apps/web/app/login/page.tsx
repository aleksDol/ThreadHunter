"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import Button from "../../components/ui/button";
import Card from "../../components/ui/card";
import ErrorAlert from "../../components/ui/error-alert";
import { apiFetch } from "../../src/lib/api-client";

type LoginResponse = {
  user: {
    id: string;
    telegramId: string;
    username: string | null;
    firstName: string | null;
  };
  workspace: {
    id: string;
    name: string;
  };
};

type TelegramWidgetUser = {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
  photo_url?: string;
  auth_date?: number;
  hash?: string;
};

declare global {
  interface Window {
    onTelegramAuth?: (user: TelegramWidgetUser) => Promise<void>;
  }
}

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [widgetReady, setWidgetReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const widgetRef = useRef<HTMLDivElement | null>(null);

  const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME?.trim();
  const isProduction = process.env.NODE_ENV === "production";
  const canUseWidget = Boolean(botUsername);
  const canUseDevFallback = !isProduction;

  async function submitTelegramPayload(payload: {
    id: string | number;
    username?: string;
    first_name?: string;
    last_name?: string;
    photo_url?: string;
    auth_date?: string | number;
    hash?: string;
  }) {
    await apiFetch<LoginResponse>("/auth/telegram", {
      method: "POST",
      body: JSON.stringify(payload)
    });

    router.push("/dashboard/comments");
    router.refresh();
  }

  useEffect(() => {
    if (!canUseWidget || !widgetRef.current) return;

    setWidgetReady(false);
    setError(null);

    window.onTelegramAuth = async (user: TelegramWidgetUser) => {
      setLoading(true);
      setError(null);
      try {
        await submitTelegramPayload({
          id: user.id,
          username: user.username,
          first_name: user.first_name,
          last_name: user.last_name,
          photo_url: user.photo_url,
          auth_date: user.auth_date,
          hash: user.hash
        });
      } catch (submitError) {
        setError(submitError instanceof Error ? submitError.message : "Login failed");
      } finally {
        setLoading(false);
      }
    };

    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.async = true;
    script.setAttribute("data-telegram-login", botUsername!);
    script.setAttribute("data-size", "large");
    script.setAttribute("data-userpic", "false");
    script.setAttribute("data-request-access", "write");
    script.setAttribute("data-onauth", "onTelegramAuth(user)");
    script.onload = () => setWidgetReady(true);

    widgetRef.current.innerHTML = "";
    widgetRef.current.appendChild(script);

    return () => {
      if (window.onTelegramAuth) {
        delete window.onTelegramAuth;
      }
    };
  }, [botUsername, canUseWidget, router]);

  async function onDevLogin() {
    setError(null);
    setLoading(true);

    try {
      if (!canUseDevFallback) {
        throw new Error("Откройте вход через Telegram");
      }

      await submitTelegramPayload({
        id: Date.now(),
        username: `dev_user_${Date.now().toString().slice(-6)}`,
        first_name: "User"
      });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  const configError = useMemo(() => {
    if (isProduction && !canUseWidget) {
      return "Telegram Login не настроен. Обратитесь к администратору.";
    }
    return null;
  }, [canUseWidget, isProduction]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <Card className="w-full max-w-md space-y-6 p-8">
        <div>
          <h1 className="text-2xl font-semibold">Войти через Telegram</h1>
          <p className="mt-2 text-sm text-slate-600">
            Авторизация нужна, чтобы создать ваш личный кабинет и управлять подключёнными Telegram-аккаунтами.
          </p>
        </div>

        {configError ? <ErrorAlert message={configError} /> : null}

        {canUseWidget ? (
          <div className="space-y-2">
            <div ref={widgetRef} />
            {!widgetReady ? <p className="text-xs text-slate-500">Загружаем Telegram Login Widget...</p> : null}
          </div>
        ) : null}

        {canUseDevFallback ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="mb-3 text-sm font-medium text-slate-900">Dev login</p>
            <Button className="w-full" onClick={onDevLogin} disabled={loading}>
              {loading ? "Выполняем вход..." : "Войти в dev-режиме"}
            </Button>
          </div>
        ) : null}

        {!canUseWidget && !canUseDevFallback ? (
          <p className="text-sm text-slate-600">Откройте вход через Telegram</p>
        ) : null}

        {error ? <ErrorAlert message={error} /> : null}
      </Card>
    </div>
  );
}
