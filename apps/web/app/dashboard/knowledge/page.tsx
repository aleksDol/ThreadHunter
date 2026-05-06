"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

import Badge from "../../../components/ui/badge";
import Button from "../../../components/ui/button";
import Card from "../../../components/ui/card";
import EmptyState from "../../../components/ui/empty-state";
import ErrorAlert from "../../../components/ui/error-alert";
import Input from "../../../components/ui/input";
import {
  createKnowledgeBase,
  createOwnedChannel,
  deleteKnowledgeBase,
  deleteOwnedChannel,
  generateOwnedChannelAiProfile,
  getOwnedChannelContextSummary,
  listKnowledgeBase,
  listOwnedChannels,
  listTelegramAccounts,
  syncOwnedChannelStats,
  updateKnowledgeBase,
  type KnowledgeBaseItem,
  type OwnedChannel,
  type OwnedChannelAiProfile,
  type OwnedChannelContextSummary,
  type TelegramAccount
} from "../../../src/lib/api-client";
import { mapRawErrorToRu } from "../../../src/lib/error-messages";

const statusVariant: Record<OwnedChannel["status"], "info" | "success" | "error"> = {
  PENDING: "info",
  ACTIVE: "success",
  FAILED: "error"
};

function formatDelta(value: number | null): string {
  if (value == null) return "-";
  if (value === 0) return "0";
  return value > 0 ? `+${value}` : `${value}`;
}

export default function KnowledgePage() {
  const [items, setItems] = useState<KnowledgeBaseItem[]>([]);
  const [ownedChannels, setOwnedChannels] = useState<OwnedChannel[]>([]);
  const [accounts, setAccounts] = useState<TelegramAccount[]>([]);
  const [summaryByChannelId, setSummaryByChannelId] = useState<Record<string, OwnedChannelContextSummary>>({});

  const [mainKnowledge, setMainKnowledge] = useState("");
  const [extraTitle, setExtraTitle] = useState("");
  const [extraContent, setExtraContent] = useState("");

  const [ownedUsername, setOwnedUsername] = useState("");
  const [ownedAccountId, setOwnedAccountId] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [savingKnowledge, setSavingKnowledge] = useState(false);
  const [syncingChannelId, setSyncingChannelId] = useState<string | null>(null);
  const [profilingChannelId, setProfilingChannelId] = useState<string | null>(null);
  const [loadingSummaries, setLoadingSummaries] = useState(false);

  const connectedAccounts = useMemo(() => accounts.filter((account) => account.status === "CONNECTED"), [accounts]);
  const mainKbItem = useMemo(
    () => items.find((item) => item.title === "Основная база знаний") ?? items[0] ?? null,
    [items]
  );
  const extraKbItems = useMemo(
    () => items.filter((item) => (mainKbItem ? item.id !== mainKbItem.id : true)),
    [items, mainKbItem]
  );

  async function load() {
    const [kb, channels, telegramAccounts] = await Promise.all([
      listKnowledgeBase(),
      listOwnedChannels(),
      listTelegramAccounts()
    ]);

    setItems(kb);
    setOwnedChannels(channels);
    setAccounts(telegramAccounts);
    setMainKnowledge((kb.find((item) => item.title === "Основная база знаний") ?? kb[0])?.content || "");

    if (!ownedAccountId && telegramAccounts.length === 1) {
      setOwnedAccountId(telegramAccounts[0].id);
    }

    setLoadingSummaries(true);
    try {
      const summaries = await Promise.all(
        channels.map(async (channel) => ({ id: channel.id, summary: await getOwnedChannelContextSummary(channel.id) }))
      );
      setSummaryByChannelId(Object.fromEntries(summaries.map((item) => [item.id, item.summary])));
    } finally {
      setLoadingSummaries(false);
    }
  }

  useEffect(() => {
    load().catch((e) => setError(mapRawErrorToRu(e instanceof Error ? e.message : "UNKNOWN_ERROR")));
  }, []);

  async function onSaveMainKnowledge(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSavingKnowledge(true);
    try {
      if (!mainKbItem) {
        await createKnowledgeBase({ title: "Основная база знаний", content: mainKnowledge });
      } else {
        await updateKnowledgeBase(mainKbItem.id, {
          title: mainKbItem.title || "Основная база знаний",
          content: mainKnowledge
        });
      }
      await load();
    } catch (e) {
      setError(mapRawErrorToRu(e instanceof Error ? e.message : "UNKNOWN_ERROR"));
    } finally {
      setSavingKnowledge(false);
    }
  }

  async function onCreateExtraKnowledge(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    try {
      await createKnowledgeBase({ title: extraTitle, content: extraContent });
      setExtraTitle("");
      setExtraContent("");
      await load();
    } catch (e) {
      setError(mapRawErrorToRu(e instanceof Error ? e.message : "UNKNOWN_ERROR"));
    }
  }

  async function onOwnedChannelSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    try {
      await createOwnedChannel({ username: ownedUsername, telegramAccountId: ownedAccountId || undefined });
      setOwnedUsername("");
      await load();
    } catch (e) {
      setError(mapRawErrorToRu(e instanceof Error ? e.message : "UNKNOWN_ERROR"));
    }
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">AI Context</h2>
      {error ? <ErrorAlert message={error} /> : null}

      <Card>
        <h3 className="mb-2 text-lg font-semibold">1. База знаний</h3>
        <p className="mb-4 text-sm text-slate-600">
          Опишите ваш продукт, услуги, кейсы, боли клиентов, стиль общения и что важно учитывать в комментариях.
        </p>
        <form onSubmit={onSaveMainKnowledge} className="space-y-3">
          <textarea
            className="min-h-44 w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-accent-500 focus:ring-2 focus:ring-accent-100"
            placeholder="Опишите продукт, офферы, стиль и ограничения"
            value={mainKnowledge}
            onChange={(e) => setMainKnowledge(e.target.value)}
            required
            maxLength={12000}
          />
          <Button type="submit">{savingKnowledge ? "Сохраняем..." : "Сохранить основную базу"}</Button>
        </form>

        <details className="mt-6">
          <summary className="cursor-pointer text-sm font-medium text-slate-700">Дополнительные блоки знаний</summary>
          <div className="mt-4 space-y-4">
            <form onSubmit={onCreateExtraKnowledge} className="space-y-3">
              <Input placeholder="Заголовок" value={extraTitle} onChange={(e) => setExtraTitle(e.target.value)} required maxLength={120} />
              <textarea
                className="min-h-32 w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-accent-500 focus:ring-2 focus:ring-accent-100"
                placeholder="Содержание"
                value={extraContent}
                onChange={(e) => setExtraContent(e.target.value)}
                required
                maxLength={12000}
              />
              <Button type="submit" variant="secondary">Добавить блок</Button>
            </form>

            {extraKbItems.map((item) => (
              <Card key={item.id} className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-medium">{item.title}</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{item.content}</p>
                </div>
                <Button
                  variant="ghost"
                  onClick={async () => {
                    try {
                      await deleteKnowledgeBase(item.id);
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
        </details>
      </Card>

      <Card>
        <h3 className="mb-2 text-lg font-semibold">2. Мой канал</h3>
        {ownedChannels.length === 0 ? (
          <EmptyState
            title="Добавьте свой Telegram-канал"
            description="AI изучит ваши темы, стиль и статистику, чтобы комментарии звучали как от вас."
          />
        ) : null}

        <form onSubmit={onOwnedChannelSubmit} className="space-y-3">
          <Input placeholder="@username или https://t.me/username" value={ownedUsername} onChange={(e) => setOwnedUsername(e.target.value)} required />
          <select
            className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm"
            value={ownedAccountId}
            onChange={(e) => setOwnedAccountId(e.target.value)}
          >
            <option value="">Выбрать рабочий аккаунт автоматически</option>
            {connectedAccounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.firstName || account.username || account.displayName || account.id}
              </option>
            ))}
          </select>
          <Button type="submit" variant="secondary">Добавить канал</Button>
        </form>
      </Card>

      {ownedChannels.map((channel) => {
        const summary = summaryByChannelId[channel.id];
        const aiProfile: OwnedChannelAiProfile | null = summary?.aiProfile ?? null;

        return (
          <Card key={channel.id} className="space-y-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold">@{channel.username}</h3>
                <p className="text-sm text-slate-600">{summary?.channel?.title || channel.title || "Название канала будет подтянуто после sync"}</p>
              </div>
              <Badge variant={statusVariant[channel.status]}>{channel.status}</Badge>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                onClick={async () => {
                  try {
                    setSyncingChannelId(channel.id);
                    await syncOwnedChannelStats(channel.id);
                    await load();
                  } catch (e) {
                    setError(mapRawErrorToRu(e instanceof Error ? e.message : "UNKNOWN_ERROR"));
                  } finally {
                    setSyncingChannelId(null);
                  }
                }}
              >
                {syncingChannelId === channel.id ? "Обновляем..." : "Обновить статистику"}
              </Button>
              <Button
                variant="secondary"
                onClick={async () => {
                  try {
                    setProfilingChannelId(channel.id);
                    await generateOwnedChannelAiProfile(channel.id);
                    await load();
                  } catch (e) {
                    setError(mapRawErrorToRu(e instanceof Error ? e.message : "UNKNOWN_ERROR"));
                  } finally {
                    setProfilingChannelId(null);
                  }
                }}
              >
                {profilingChannelId === channel.id ? "Генерируем..." : "Обновить AI-профиль"}
              </Button>
              <Button
                variant="ghost"
                onClick={async () => {
                  try {
                    await deleteOwnedChannel(channel.id);
                    await load();
                  } catch (e) {
                    setError(mapRawErrorToRu(e instanceof Error ? e.message : "UNKNOWN_ERROR"));
                  }
                }}
              >
                Удалить
              </Button>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <Card>
                <p className="text-sm text-slate-500">Подписчики</p>
                <p className="text-2xl font-semibold">{summary?.latestSnapshot?.subscriberCount ?? "-"}</p>
                <p className="text-sm text-slate-600">{summary ? `${formatDelta(summary.delta.subscriberCount)} за период` : "Динамика появится после обновлений"}</p>
              </Card>
              <Card>
                <p className="text-sm text-slate-500">Средние просмотры</p>
                <p className="text-2xl font-semibold">{summary?.latestSnapshot?.averageViews ?? "-"}</p>
                <p className="text-sm text-slate-600">{summary ? `${formatDelta(summary.delta.averageViews)} за период` : "Динамика появится после обновлений"}</p>
              </Card>
              <Card>
                <p className="text-sm text-slate-500">Постов проанализировано</p>
                <p className="text-2xl font-semibold">{summary?.postSampleCount ?? "-"}</p>
                <p className="text-sm text-slate-600">{summary?.latestSnapshot ? `Снимок: ${new Date(summary.latestSnapshot.capturedAt).toLocaleString()}` : "Сначала обновите статистику"}</p>
              </Card>
            </div>

            <Card>
              <h4 className="mb-2 text-base font-semibold">3. AI-профиль канала</h4>
              <p className="mb-3 text-sm text-slate-600">
                Этот профиль используется при анализе постов и генерации комментариев. Сырые посты не отправляются в каждый запрос, используется короткая сводка.
              </p>

              {!aiProfile || aiProfile.status === "PENDING" ? (
                <p className="text-sm text-slate-700">AI-профиль формируется. Обычно это занимает несколько минут.</p>
              ) : null}

              {aiProfile?.status === "FAILED" ? (
                <p className="text-sm text-rose-700">Не удалось сформировать AI-профиль: {aiProfile.avoidNotes || "Недостаточно текстовых постов для анализа"}</p>
              ) : null}

              {aiProfile?.status === "READY" ? (
                <div className="grid gap-3 text-sm text-slate-700 lg:grid-cols-2">
                  <Card><p className="font-medium">Стиль</p><p>{aiProfile.styleSummary || "-"}</p></Card>
                  <Card><p className="font-medium">Основные темы</p><p>{aiProfile.topicSummary || "-"}</p></Card>
                  <Card><p className="font-medium">Позиционирование</p><p>{aiProfile.positioningSummary || "-"}</p></Card>
                  <Card><p className="font-medium">Повторяющиеся идеи</p><p>{aiProfile.recurringIdeas || "-"}</p></Card>
                  <Card><p className="font-medium">Лексика</p><p>{aiProfile.vocabularyNotes || "-"}</p></Card>
                  <Card><p className="font-medium">Чего избегать</p><p>{aiProfile.avoidNotes || "-"}</p></Card>
                </div>
              ) : null}
            </Card>

            <Card>
              <h4 className="mb-2 text-base font-semibold">4. Статистика канала</h4>
              {!summary ? (
                <p className="text-sm text-slate-600">{loadingSummaries ? "Загружаем статистику..." : "Нет данных по каналу"}</p>
              ) : summary.firstSnapshot && summary.latestSnapshot && summary.firstSnapshot.id !== summary.latestSnapshot.id ? (
                <div className="text-sm text-slate-700">
                  <p>Подписчики: {formatDelta(summary.delta.subscriberCount)} за период</p>
                  <p>Средние просмотры: {formatDelta(summary.delta.averageViews)} за период</p>
                </div>
              ) : (
                <p className="text-sm text-slate-600">Динамика появится после нескольких обновлений статистики.</p>
              )}
            </Card>
          </Card>
        );
      })}
    </div>
  );
}
