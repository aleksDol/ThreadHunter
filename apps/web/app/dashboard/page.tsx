"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import Badge from "../../components/ui/badge";
import Button from "../../components/ui/button";
import Card from "../../components/ui/card";
import ErrorAlert from "../../components/ui/error-alert";
import Input from "../../components/ui/input";
import {
  checkMonitoredChannelHealth,
  createKnowledgeBase,
  createMonitoredChannel,
  getOnboardingStatus,
  getMe,
  listKnowledgeBase,
  listMonitoredChannels,
  listTelegramAccounts,
  startMonitoringChannel,
  startTelegramVerification,
  updateMonitoredChannel,
  updateTelegramAccount,
  type ChannelHealth,
  type KnowledgeBaseItem,
  type MonitoredChannel,
  type OnboardingStatus,
  type TelegramAccount
} from "../../src/lib/api-client";
import { mapChannelHealthCodeToRu, mapRawErrorToRu } from "../../src/lib/error-messages";

function doneBadge(done: boolean) {
  return <Badge variant={done ? "success" : "warning"}>{done ? "Done" : "Todo"}</Badge>;
}

export default function DashboardHomePage() {
  const router = useRouter();
  const [onboarding, setOnboarding] = useState<OnboardingStatus | null>(null);
  const [accounts, setAccounts] = useState<TelegramAccount[]>([]);
  const [channels, setChannels] = useState<MonitoredChannel[]>([]);
  const [knowledge, setKnowledge] = useState<KnowledgeBaseItem[]>([]);
  const [diagnostics, setDiagnostics] = useState<ChannelHealth[]>([]);
  const [me, setMe] = useState<Awaited<ReturnType<typeof getMe>> | null>(null);
  const [verifyLinkExpiresAt, setVerifyLinkExpiresAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [proxyHost, setProxyHost] = useState("");
  const [proxyPort, setProxyPort] = useState("");
  const [proxyUsername, setProxyUsername] = useState("");
  const [proxyPassword, setProxyPassword] = useState("");

  const [channelUsername, setChannelUsername] = useState("");
  const [kbTitle, setKbTitle] = useState("");
  const [kbContent, setKbContent] = useState("");

  async function load() {
    const [onb, accs, chs, kb, meRes] = await Promise.all([
      getOnboardingStatus(),
      listTelegramAccounts(),
      listMonitoredChannels(),
      listKnowledgeBase(),
      getMe()
    ]);

    setOnboarding(onb);
    setAccounts(accs);
    setChannels(chs);
    setKnowledge(kb);
    setMe(meRes);

    const health = await Promise.all(chs.map((c) => checkMonitoredChannelHealth(c.id).catch(() => null)));
    setDiagnostics(health.filter(Boolean) as ChannelHealth[]);
  }

  useEffect(() => {
    load().catch((e) => setError(mapRawErrorToRu(e instanceof Error ? e.message : "UNKNOWN_ERROR")));
  }, []);

  const connectedAccount = useMemo(() => accounts.find((a) => a.status === "CONNECTED") || null, [accounts]);
  const proxyDone = !!(connectedAccount?.proxyHost && connectedAccount.proxyPort);
  const problemChannels = diagnostics.filter((d) => d.health !== "OK");

  async function saveProxy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!connectedAccount) return;

    try {
      await updateTelegramAccount(connectedAccount.id, {
        proxyHost: proxyHost || undefined,
        proxyPort: proxyPort ? Number(proxyPort) : null,
        proxyUsername: proxyUsername || undefined,
        proxyPassword: proxyPassword || undefined
      });

      await load();
    } catch (e) {
      setError(mapRawErrorToRu(e instanceof Error ? e.message : "UNKNOWN_ERROR"));
    }
  }

  async function addChannel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      await createMonitoredChannel({
        username: channelUsername,
        telegramAccountId: connectedAccount?.id || undefined
      });

      setChannelUsername("");
      await load();
    } catch (e) {
      setError(mapRawErrorToRu(e instanceof Error ? e.message : "UNKNOWN_ERROR"));
    }
  }

  async function addKnowledge(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      await createKnowledgeBase({ title: kbTitle, content: kbContent });
      setKbTitle("");
      setKbContent("");
      await load();
    } catch (e) {
      setError(mapRawErrorToRu(e instanceof Error ? e.message : "UNKNOWN_ERROR"));
    }
  }

  async function startAuto() {
    setError(null);

    if (!connectedAccount) {
      setError("Сначала подключите Telegram-аккаунт.");
      return;
    }
    if (channels.length === 0) {
      setError("Добавьте хотя бы один канал.");
      return;
    }
    if (knowledge.length === 0) {
      setError("Добавьте хотя бы одну запись базы знаний.");
      return;
    }

    const results = await Promise.all(
      channels.map(async (channel) => {
        try {
          if (!channel.telegramAccountId) {
            await updateMonitoredChannel(channel.id, { telegramAccountId: connectedAccount.id });
          }
          await startMonitoringChannel(channel.id);
          return { ok: true as const };
        } catch (e) {
          return { ok: false as const, error: mapRawErrorToRu(e instanceof Error ? e.message : "UNKNOWN_ERROR") };
        }
      })
    );

    const failed = results.filter((r) => !r.ok);
    if (failed.length > 0) {
      setError(`Не удалось запустить monitoring для ${failed.length} канал(ов). Проверьте блок диагностики ниже.`);
      await load();
      return;
    }

    router.push("/dashboard/comments");
  }

  return (
    <div className="space-y-6">
      {error ? <ErrorAlert message={error} /> : null}

      <Card className="space-y-3">
        <h2 className="text-xl font-semibold">Подтверждение Telegram</h2>
        {me?.user.telegramVerifiedAt ? (
          <p className="text-sm text-emerald-700">
            Telegram подтверждён{me.user.username ? `: @${me.user.username}` : ""}.
          </p>
        ) : (
          <>
            <p className="text-sm text-slate-600">
              Telegram не подтверждён. Подтвердите Telegram, чтобы получать уведомления и завершить настройку аккаунта.
            </p>
            <p className="text-sm text-slate-600">
              Это подтверждение вашего профиля и канал для уведомлений.
            </p>
            <p className="text-sm text-slate-600">
              Рабочий Telegram-аккаунт, от имени которого система пишет комментарии, подключается отдельно в разделе
              “Аккаунты” через QR-код.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={async () => {
                  try {
                    const started = await startTelegramVerification();
                    setVerifyLinkExpiresAt(started.expiresAt);
                    window.open(started.botUrl, "_blank", "noopener,noreferrer");
                    const startedAt = Date.now();
                    const pollInterval = 2500;
                    const maxPollMs = 2 * 60 * 1000;

                    const poll = async () => {
                      const latestMe = await getMe();
                      setMe(latestMe);
                      if (latestMe.user.telegramVerifiedAt) return;
                      if (Date.now() - startedAt >= maxPollMs) return;
                      setTimeout(() => {
                        poll().catch(() => undefined);
                      }, pollInterval);
                    };

                    poll().catch(() => undefined);
                  } catch (e) {
                    setError(mapRawErrorToRu(e instanceof Error ? e.message : "UNKNOWN_ERROR"));
                  }
                }}
              >
                Перейти в бота
              </Button>
            </div>
            {verifyLinkExpiresAt ? (
              <p className="text-xs text-slate-500">Ссылка действует до: {new Date(verifyLinkExpiresAt).toLocaleString()}</p>
            ) : null}
          </>
        )}
      </Card>

      <Card>
        <h2 className="text-xl font-semibold">Setup Wizard</h2>
        <p className="text-sm text-slate-600">1) Аккаунт 2) Proxy 3) Каналы 4) База знаний 5) AUTO-комментинг</p>
      </Card>

      <Card className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Шаг 1 — Telegram аккаунт</h3>
          {doneBadge(!!connectedAccount)}
        </div>
        <p className="text-sm text-slate-600">Статус: {connectedAccount ? "подключён" : "не подключён"}</p>
        <Button onClick={() => router.push("/dashboard/accounts")}>Подключить аккаунт</Button>
      </Card>

      <Card className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Шаг 2 — Proxy</h3>
          {doneBadge(proxyDone)}
        </div>
        <p className="text-sm text-slate-600">Proxy снижает риск ограничений и помогает стабильности аккаунта.</p>
        {connectedAccount ? (
          <form onSubmit={saveProxy} className="grid gap-3 md:grid-cols-2">
            <Input placeholder="proxyHost" value={proxyHost} onChange={(e) => setProxyHost(e.target.value)} />
            <Input placeholder="proxyPort" value={proxyPort} onChange={(e) => setProxyPort(e.target.value)} />
            <Input placeholder="proxyUsername" value={proxyUsername} onChange={(e) => setProxyUsername(e.target.value)} />
            <Input placeholder="proxyPassword" value={proxyPassword} onChange={(e) => setProxyPassword(e.target.value)} />
            <div className="md:col-span-2">
              <Button type="submit">Сохранить proxy</Button>
            </div>
          </form>
        ) : (
          <p className="text-sm text-slate-500">Сначала подключите Telegram-аккаунт.</p>
        )}
      </Card>

      <Card className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Шаг 3 — Каналы</h3>
          {doneBadge(channels.length > 0)}
        </div>
        <p className="text-sm text-slate-600">На каналы нужно подписаться вручную с подключённого Telegram-аккаунта.</p>
        <form onSubmit={addChannel} className="flex gap-3">
          <Input placeholder="@channel_username" value={channelUsername} onChange={(e) => setChannelUsername(e.target.value)} required />
          <Button type="submit">Добавить канал</Button>
        </form>
        <div className="space-y-2">
          {channels.map((channel) => (
            <div key={channel.id} className="rounded-2xl border border-slate-200 px-3 py-2 text-sm">
              @{channel.username} — {channel.status}
            </div>
          ))}
        </div>
      </Card>

      <Card className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Шаг 4 — База знаний</h3>
          {doneBadge(knowledge.length > 0)}
        </div>
        <p className="text-sm text-slate-600">Опишите продукт, услуги, кейсы, боли клиентов и стиль общения.</p>
        <form onSubmit={addKnowledge} className="space-y-3">
          <Input placeholder="title" value={kbTitle} onChange={(e) => setKbTitle(e.target.value)} required />
          <textarea
            className="min-h-36 w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-accent-500 focus:ring-2 focus:ring-accent-100"
            placeholder="content"
            value={kbContent}
            onChange={(e) => setKbContent(e.target.value)}
            required
          />
          <Button type="submit">Сохранить базу знаний</Button>
        </form>
      </Card>

      <Card className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Шаг 5 — Включить комментинг</h3>
          {doneBadge(Boolean(onboarding?.hasActiveMonitoring))}
        </div>
        <Button onClick={startAuto}>Включить AUTO-комментинг</Button>
      </Card>

      {problemChannels.length > 0 ? (
        <Card className="space-y-3 border-rose-200 bg-rose-50">
          <h3 className="text-lg font-semibold text-rose-700">Проблемные каналы</h3>
          {problemChannels.map((problem) => (
            <div key={problem.channelId} className="rounded-2xl border border-rose-200 bg-white px-4 py-3">
              <p className="font-medium text-rose-700">@{problem.username} — {mapChannelHealthCodeToRu(problem.health)}</p>
              <p className="text-sm text-slate-700">{problem.message}</p>
              <p className="text-sm text-slate-600">Что сделать: {problem.advice}</p>
            </div>
          ))}
        </Card>
      ) : null}
    </div>
  );
}
