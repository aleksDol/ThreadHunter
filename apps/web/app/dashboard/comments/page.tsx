"use client";

import { useEffect, useMemo, useState } from "react";

import Badge, { statusBadgeVariant } from "../../../components/ui/badge";
import Button from "../../../components/ui/button";
import Card from "../../../components/ui/card";
import EmptyState from "../../../components/ui/empty-state";
import ErrorAlert from "../../../components/ui/error-alert";
import {
  getBillingStatus,
  listGeneratedComments,
  listMonitoredChannels,
  startMonitoringChannel,
  stopMonitoringChannel,
  type BillingStatus,
  type GeneratedCommentFeedItem,
  type MonitoredChannel
} from "../../../src/lib/api-client";
import { mapRawErrorToRu } from "../../../src/lib/error-messages";

type UiFilter = "all" | "sent" | "failed" | "queued";

function formatDate(value: string | null | undefined): string {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

function unifiedStatus(item: GeneratedCommentFeedItem): string {
  if (item.status === "SENT" || item.dispatchJob?.status === "SENT") return "SENT";
  if (item.status === "FAILED" || item.dispatchJob?.status === "FAILED") return "FAILED";
  if (item.status === "QUEUED" || item.dispatchJob?.status === "READY" || item.dispatchJob?.status === "SCHEDULED") return "QUEUED";
  return "DRAFT";
}

function friendlyError(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes("trial") || lower.includes("limit")) {
    return "Лимит отправки достигнут. Напишите нам для оплаты";
  }
  return mapRawErrorToRu(raw);
}

export default function CommentsPage() {
  const [items, setItems] = useState<GeneratedCommentFeedItem[]>([]);
  const [channels, setChannels] = useState<MonitoredChannel[]>([]);
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<UiFilter>("all");
  const [autoLoading, setAutoLoading] = useState(false);
  const paymentContactUrl = process.env.NEXT_PUBLIC_PAYMENT_CONTACT_URL || "#";

  async function load() {
    const [comments, billingStatus, monitored] = await Promise.all([
      listGeneratedComments(),
      getBillingStatus(),
      listMonitoredChannels()
    ]);
    setItems(comments);
    setBilling(billingStatus);
    setChannels(monitored);
  }

  useEffect(() => {
    load().catch((e) => setError(mapRawErrorToRu(e instanceof Error ? e.message : "UNKNOWN_ERROR")));
  }, []);

  const trialDaysLeft = useMemo(() => {
    if (!billing?.trialEndsAt) return null;
    const diffMs = new Date(billing.trialEndsAt).getTime() - Date.now();
    return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
  }, [billing]);

  const autoEnabled = useMemo(() => channels.some((c) => c.status === "ACTIVE"), [channels]);

  const sentToday = useMemo(() => {
    const now = new Date();
    return items.filter((item) => {
      const sentAt = item.dispatchJob?.sentAt;
      if (!sentAt) return false;
      const d = new Date(sentAt);
      return (
        d.getFullYear() === now.getFullYear() &&
        d.getMonth() === now.getMonth() &&
        d.getDate() === now.getDate()
      );
    }).length;
  }, [items]);

  const filteredItems = useMemo(() => {
    if (filter === "all") return items;
    return items.filter((item) => unifiedStatus(item).toLowerCase() === filter);
  }, [items, filter]);

  async function toggleAuto(enable: boolean) {
    setError(null);
    setAutoLoading(true);
    try {
      const targets = channels.filter((c) => !!c.telegramAccountId);
      await Promise.all(
        targets.map((c) => (enable ? startMonitoringChannel(c.id) : stopMonitoringChannel(c.id)))
      );
      await load();
    } catch (e) {
      setError(mapRawErrorToRu(e instanceof Error ? e.message : "UNKNOWN_ERROR"));
    } finally {
      setAutoLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-600">Сначала комментарий создаётся как черновик. Отправка происходит только после вашего одобрения.</p>
      {error ? <ErrorAlert message={error} /> : null}

      {billing ? (
        <Card>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-slate-600">Trial: осталось {trialDaysLeft ?? "-"} дня</p>
              <p className="text-sm text-slate-600">Комментарии: {billing.commentsSentCount} / {billing.commentLimit}</p>
              {!billing.canDispatch ? <p className="text-sm font-medium text-rose-700">Лимит достигнут. Напишите нам для оплаты.</p> : null}
            </div>
            <a href={paymentContactUrl} target="_blank" rel="noreferrer">
              <Button variant="secondary">Связаться</Button>
            </a>
          </div>
        </Card>
      ) : null}

      <Card>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-600">AUTO-комментинг:</span>
            <Badge variant={autoEnabled ? "success" : "warning"}>{autoEnabled ? "ВКЛ" : "ВЫКЛ"}</Badge>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => toggleAuto(true)} disabled={autoLoading}>Включить</Button>
            <Button variant="secondary" onClick={() => toggleAuto(false)} disabled={autoLoading}>Выключить</Button>
          </div>
        </div>
      </Card>

      <Card>
        <p className="text-sm text-slate-600">Сегодня отправлено: <span className="font-semibold text-slate-900">{sentToday}</span> комментариев</p>
      </Card>

      <div className="flex flex-wrap gap-2">
        {(["all", "sent", "failed", "queued"] as UiFilter[]).map((value) => (
          <Button key={value} variant={filter === value ? "primary" : "secondary"} onClick={() => setFilter(value)}>
            {value.toUpperCase()}
          </Button>
        ))}
      </div>

      {filteredItems.length === 0 ? (
        <EmptyState
          title="Пока нет комментариев"
          description="Система сама найдёт обсуждения и начнёт писать комментарии от вашего имени после запуска AUTO-комментинга."
        />
      ) : (
        <div className="grid gap-4">
          {filteredItems.map((item) => {
            const dispatch = item.dispatchJob;
            const status = unifiedStatus(item);
            const rawError = dispatch?.error || (item.status === "FAILED" ? item.safetyReason : null);

            return (
              <Card key={item.id} className="space-y-3">
                <Badge variant={statusBadgeVariant(status)}>{status}</Badge>
                <p className="whitespace-pre-wrap text-sm leading-6 text-slate-800">{item.text}</p>
                <p className="text-sm text-slate-600">
                  Канал: @{item.opportunity.monitoredChannel.username}
                  {item.opportunity.monitoredChannel.title ? ` (${item.opportunity.monitoredChannel.title})` : ""}
                </p>
                <div className="grid gap-1 text-sm text-slate-600">
                  <p>Создан: {formatDate(item.createdAt)}</p>
                  <p>Запланирован: {formatDate(dispatch?.scheduledAt)}</p>
                  <p>Отправлен: {formatDate(dispatch?.sentAt)}</p>
                </div>
                {rawError ? <ErrorAlert message={friendlyError(rawError)} /> : null}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
