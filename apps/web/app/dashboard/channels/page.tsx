"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

import Badge from "../../../components/ui/badge";
import Button from "../../../components/ui/button";
import Card from "../../../components/ui/card";
import EmptyState from "../../../components/ui/empty-state";
import ErrorAlert from "../../../components/ui/error-alert";
import Input from "../../../components/ui/input";
import {
  checkMonitoredChannelHealth,
  createMonitoredChannel,
  deleteMonitoredChannel,
  listMonitoredChannels,
  listTelegramAccounts,
  retryMonitoredChannelJoin,
  startMonitoringChannel,
  stopMonitoringChannel,
  type ChannelHealth,
  type MonitoredChannel,
  type TelegramAccount
} from "../../../src/lib/api-client";
import { mapChannelHealthCodeToRu, mapRawErrorToRu } from "../../../src/lib/error-messages";

function healthLabel(code: ChannelHealth["health"]): string {
  return mapChannelHealthCodeToRu(code);
}

function joinStatusText(status: MonitoredChannel["joinStatus"]): string {
  if (status === "PENDING") return "Готовим доступ";
  if (status === "JOINING") return "Подписываемся";
  if (status === "JOINED") return "Доступ готов";
  if (status === "FAILED") return "Ошибка доступа";
  if (status === "NOT_REQUIRED") return "Доступ уже есть";
  return "-";
}

function discussionStatusText(status: MonitoredChannel["discussionJoinStatus"]): string {
  if (status === "JOINED" || status === "NOT_REQUIRED") return "Комментарии проверены";
  if (status === "PENDING" || status === "JOINING") return "Проверяем комментарии";
  if (status === "FAILED") return "Проблема с комментариями";
  return "-";
}

export default function ChannelsPage() {
  const [items, setItems] = useState<MonitoredChannel[]>([]);
  const [accounts, setAccounts] = useState<TelegramAccount[]>([]);
  const [health, setHealth] = useState<ChannelHealth[]>([]);
  const [username, setUsername] = useState("");
  const [telegramAccountId, setTelegramAccountId] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const [channels, telegramAccounts] = await Promise.all([listMonitoredChannels(), listTelegramAccounts()]);
    setItems(channels);
    setAccounts(telegramAccounts);
    const healthRes = await Promise.all(channels.map((c) => checkMonitoredChannelHealth(c.id).catch(() => null)));
    setHealth(healthRes.filter(Boolean) as ChannelHealth[]);
  }

  useEffect(() => {
    load().catch((e) => setError(mapRawErrorToRu(e instanceof Error ? e.message : "UNKNOWN_ERROR")));
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    try {
      await createMonitoredChannel({ username, telegramAccountId: telegramAccountId || undefined });
      setUsername("");
      setTelegramAccountId("");
      await load();
    } catch (e) {
      setError(mapRawErrorToRu(e instanceof Error ? e.message : "UNKNOWN_ERROR"));
    }
  }

  const problemChannels = useMemo(() => health.filter((h) => h.health !== "OK"), [health]);

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-600">Мониторинг работает только с новыми постами после запуска. Старые посты не сканируются.</p>
      {error ? <ErrorAlert message={error} /> : null}

      <Card>
        <h2 className="mb-4 text-lg font-semibold">Добавить канал</h2>
        <p className="mb-3 text-sm text-slate-600">После добавления система аккуратно подготовит доступ: подпишется на канал и проверит комментарии. Обычно это занимает от нескольких минут до суток.</p>
        <form onSubmit={onSubmit} className="space-y-3">
          <Input placeholder="username or t.me link" value={username} onChange={(e) => setUsername(e.target.value)} required />
          <select
            className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm"
            value={telegramAccountId}
            onChange={(e) => setTelegramAccountId(e.target.value)}
          >
            <option value="">No account</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.displayName || account.phone || account.id}
              </option>
            ))}
          </select>
          <Button type="submit">Добавить канал</Button>
        </form>
      </Card>

      {problemChannels.length > 0 ? (
        <Card className="space-y-3 border-rose-200 bg-rose-50">
          <h3 className="text-lg font-semibold text-rose-700">Проблемные каналы</h3>
          {problemChannels.map((problem) => (
            <div key={problem.channelId} className="rounded-2xl border border-rose-200 bg-white px-4 py-3">
              <p className="font-medium text-rose-700">@{problem.username}</p>
              <p className="text-sm text-slate-700">Причина: {healthLabel(problem.health)}</p>
              <p className="text-sm text-slate-600">Что сделать: {problem.advice}</p>
            </div>
          ))}
        </Card>
      ) : null}

      {items.length === 0 ? (
        <EmptyState
          title="Добавьте каналы для мониторинга"
          description="Система сама найдёт обсуждения и начнёт готовить комментарии после запуска AUTO-комментинга."
          ctaLabel="Добавить канал"
          ctaHref="/dashboard/channels"
        />
      ) : (
        <div className="grid gap-4">
          {items.map((item) => (
            <Card key={item.id} className={item.joinStatus === "PENDING" || item.joinStatus === "JOINING" ? "animate-pulse" : ""}>
              <div className="mb-2 flex items-center justify-between">
                <p className="font-medium">@{item.username}</p>
                <Badge variant="info">{item.status}</Badge>
              </div>
              <p className="text-sm text-slate-600">Подготовка доступа: {joinStatusText(item.joinStatus)}</p>
              <p className="text-sm text-slate-600">Комментарии: {discussionStatusText(item.discussionJoinStatus)}</p>
              <p className="text-sm text-slate-600">Следующая попытка: {item.nextJoinAttemptAt ? new Date(item.nextJoinAttemptAt).toLocaleString() : "-"}</p>
              <p className="text-sm text-slate-600">Последняя синхронизация: {item.lastSyncAt ? new Date(item.lastSyncAt).toLocaleString() : "-"}</p>
              {item.joinError ? <p className="text-sm text-rose-700">{item.joinError}</p> : null}
              {item.discussionJoinError ? <p className="text-sm text-rose-700">{item.discussionJoinError}</p> : null}
              <div className="mt-4 flex flex-wrap gap-2">
                <Button variant="secondary" onClick={async () => { try { await startMonitoringChannel(item.id); await load(); } catch (e) { setError(mapRawErrorToRu(e instanceof Error ? e.message : "UNKNOWN_ERROR")); } }}>Запустить</Button>
                <Button variant="ghost" onClick={async () => { try { await stopMonitoringChannel(item.id); await load(); } catch (e) { setError(mapRawErrorToRu(e instanceof Error ? e.message : "UNKNOWN_ERROR")); } }}>Остановить</Button>
                <Button variant="secondary" onClick={async () => { try { await retryMonitoredChannelJoin(item.id); await load(); } catch (e) { setError(mapRawErrorToRu(e instanceof Error ? e.message : "UNKNOWN_ERROR")); } }}>Повторить подготовку доступа</Button>
                <Button variant="secondary" onClick={async () => { try { await deleteMonitoredChannel(item.id); await load(); } catch (e) { setError(mapRawErrorToRu(e instanceof Error ? e.message : "UNKNOWN_ERROR")); } }}>Удалить</Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
