"use client";

import { FormEvent, useEffect, useState } from "react";

import Button from "../../../components/ui/button";
import Card from "../../../components/ui/card";
import EmptyState from "../../../components/ui/empty-state";
import ErrorAlert from "../../../components/ui/error-alert";
import Input from "../../../components/ui/input";
import {
  cancelTelegramConnectSession,
  createTelegramAccount,
  deleteTelegramAccount,
  getTelegramConnectSession,
  listTelegramAccounts,
  startTelegramConnect,
  type TelegramAccount,
  type TelegramLoginSession
} from "../../../src/lib/api-client";
import { mapRawErrorToRu } from "../../../src/lib/error-messages";

export default function AccountsPage() {
  const [items, setItems] = useState<TelegramAccount[]>([]);
  const [displayName, setDisplayName] = useState("");
  const [connectDisplayName, setConnectDisplayName] = useState("");
  const [activeLoginSessionId, setActiveLoginSessionId] = useState<string | null>(null);
  const [connectState, setConnectState] = useState<TelegramLoginSession | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const accounts = await listTelegramAccounts();
    setItems(accounts);
  }

  useEffect(() => {
    load().catch((e) => setError(mapRawErrorToRu(e instanceof Error ? e.message : "UNKNOWN_ERROR")));
  }, []);

  useEffect(() => {
    if (!activeLoginSessionId) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      try {
        const session = await getTelegramConnectSession(activeLoginSessionId);
        if (stopped) return;
        setConnectState(session);
        if (["CONNECTED", "FAILED", "EXPIRED"].includes(session.status)) {
          await load();
          return;
        }
        timer = setTimeout(poll, 2500);
      } catch (pollError) {
        if (!stopped) setError(mapRawErrorToRu(pollError instanceof Error ? pollError.message : "UNKNOWN_ERROR"));
      }
    };

    poll().catch((pollError) => setError(mapRawErrorToRu(pollError instanceof Error ? pollError.message : "UNKNOWN_ERROR")));
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [activeLoginSessionId]);

  async function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await createTelegramAccount({ displayName: displayName || undefined });
      setDisplayName("");
      await load();
    } catch (e) {
      setError(mapRawErrorToRu(e instanceof Error ? e.message : "UNKNOWN_ERROR"));
    }
  }

  async function onConnectStart(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const created = await startTelegramConnect({ displayName: connectDisplayName || undefined });
      setActiveLoginSessionId(created.loginSessionId);
      setConnectState(null);
    } catch (e) {
      setError(mapRawErrorToRu(e instanceof Error ? e.message : "UNKNOWN_ERROR"));
    }
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-600">Подключайте только аккаунты, которыми реально пользуетесь. Не отправляйте много комментариев в первый день.</p>
      {error ? <ErrorAlert message={error} /> : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 text-lg font-semibold">Добавить аккаунт</h2>
          <form onSubmit={onCreate} className="space-y-3">
            <Input placeholder="Display name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            <Button type="submit">Создать аккаунт</Button>
          </form>
        </Card>

        <Card>
          <h2 className="mb-4 text-lg font-semibold">Подключить Telegram аккаунт по QR</h2>
          <form onSubmit={onConnectStart} className="space-y-3">
            <Input placeholder="Display name" value={connectDisplayName} onChange={(e) => setConnectDisplayName(e.target.value)} />
            <Button type="submit">Подключить аккаунт</Button>
          </form>
          <div className="mt-4 space-y-2 text-sm text-slate-600">
            <p>Статус: {connectState?.status || "Нет активной сессии подключения"}</p>
            {connectState?.qrUrl ? <p className="break-all">QR URL: {connectState.qrUrl}</p> : null}
            {activeLoginSessionId ? (
              <Button
                variant="ghost"
                onClick={async () => {
                  await cancelTelegramConnectSession(activeLoginSessionId);
                  setActiveLoginSessionId(null);
                  setConnectState(null);
                  await load();
                }}
              >
                Отменить подключение
              </Button>
            ) : null}
          </div>
        </Card>
      </div>

      {items.length === 0 ? (
        <EmptyState
          title="Подключите Telegram-аккаунт"
          description="Он будет читать новые посты и отправлять одобренные экспертные комментарии."
          ctaLabel="Подключить аккаунт"
          ctaHref="/dashboard/accounts"
        />
      ) : (
        <div className="grid gap-4">
          {items.map((item) => (
            <Card key={item.id} className="flex items-center justify-between">
              <div>
                <p className="font-medium">{item.displayName || item.username || "Unnamed"}</p>
                <p className="text-sm text-slate-600">Статус: {item.status}</p>
              </div>
              <Button
                variant="secondary"
                onClick={async () => {
                  try {
                    await deleteTelegramAccount(item.id);
                    await load();
                  } catch (e) {
                    setError(mapRawErrorToRu(e instanceof Error ? e.message : "UNKNOWN_ERROR"));
                  }
                }}
              >
                Удалить
              </Button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
