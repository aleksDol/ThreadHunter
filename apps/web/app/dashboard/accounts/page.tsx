"use client";

import { useEffect, useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";

import Badge from "../../../components/ui/badge";
import Button from "../../../components/ui/button";
import Card from "../../../components/ui/card";
import ErrorAlert from "../../../components/ui/error-alert";
import Input from "../../../components/ui/input";
import {
  cancelTelegramConnectSession,
  getTelegramConnectSession,
  listTelegramAccounts,
  startTelegramConnect,
  updateTelegramAccount,
  type TelegramAccount,
  type TelegramLoginSession
} from "../../../src/lib/api-client";
import { mapRawErrorToRu } from "../../../src/lib/error-messages";

function connectStatusLabel(state: TelegramLoginSession | null): string {
  if (!state) return "Генерируем QR...";
  if (state.status === "QR_READY") return "QR готов. Отсканируйте его в Telegram.";
  if (state.status === "WAITING_SCAN") return "Ожидаем сканирование...";
  if (state.status === "CONNECTED") return "Аккаунт подключён";
  if (state.status === "EXPIRED") return "QR истёк, попробуйте снова";
  if (state.status === "FAILED") return `Ошибка подключения: ${state.error || "неизвестная ошибка"}`;
  return "Генерируем QR...";
}

export default function AccountsPage() {
  const [items, setItems] = useState<TelegramAccount[]>([]);
  const [activeLoginSessionId, setActiveLoginSessionId] = useState<string | null>(null);
  const [connectState, setConnectState] = useState<TelegramLoginSession | null>(null);
  const [loadingConnect, setLoadingConnect] = useState(false);
  const [expandedProxyFor, setExpandedProxyFor] = useState<string | null>(null);
  const [proxyHost, setProxyHost] = useState("");
  const [proxyPort, setProxyPort] = useState("");
  const [proxyUsername, setProxyUsername] = useState("");
  const [proxyPassword, setProxyPassword] = useState("");
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
          if (session.status === "CONNECTED") {
            setTimeout(() => {
              if (!stopped) {
                setActiveLoginSessionId(null);
                setConnectState(null);
              }
            }, 1500);
          }
          return;
        }

        timer = setTimeout(poll, 2000);
      } catch (pollError) {
        if (!stopped) {
          setError(mapRawErrorToRu(pollError instanceof Error ? pollError.message : "UNKNOWN_ERROR"));
        }
      }
    };

    poll().catch((pollError) =>
      setError(mapRawErrorToRu(pollError instanceof Error ? pollError.message : "UNKNOWN_ERROR"))
    );

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [activeLoginSessionId]);

  const empty = items.length === 0;
  const qrVisible = Boolean(activeLoginSessionId);
  const connectLabel = useMemo(() => connectStatusLabel(connectState), [connectState]);

  async function onConnectStart() {
    setError(null);
    setLoadingConnect(true);
    try {
      const created = await startTelegramConnect({ displayName: "Рабочий аккаунт" });
      setActiveLoginSessionId(created.loginSessionId);
      setConnectState(null);
    } catch (e) {
      setError(mapRawErrorToRu(e instanceof Error ? e.message : "UNKNOWN_ERROR"));
    } finally {
      setLoadingConnect(false);
    }
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-600">
        Здесь подключается рабочий Telegram-аккаунт для мониторинга каналов и отправки комментариев. Это не то же самое, что Telegram-подтверждение профиля.
      </p>

      {error ? <ErrorAlert message={error} /> : null}

      <Card className="space-y-4">
        <h2 className="text-2xl font-semibold">Подключите рабочий Telegram-аккаунт</h2>
        <p className="text-sm text-slate-600">
          Этот аккаунт будет читать новые посты в каналах и отправлять экспертные комментарии.
        </p>
        <div>
          <Button onClick={onConnectStart} disabled={loadingConnect || qrVisible}>
            {loadingConnect ? "Подключаем..." : "Подключить аккаунт"}
          </Button>
        </div>
        <p className="text-sm text-slate-600">
          Это не Telegram-подтверждение профиля. Это отдельный рабочий аккаунт, от имени которого будут публиковаться комментарии.
        </p>
      </Card>

      {qrVisible ? (
        <Card className="space-y-4">
          <h3 className="text-xl font-semibold">Отсканируйте QR-код в Telegram</h3>
          <p className="text-sm text-slate-600">Telegram → Настройки → Устройства → Подключить устройство</p>

          <div className="flex flex-col items-start gap-3">
            {connectState?.qrUrl ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <QRCodeSVG value={connectState.qrUrl} size={220} />
              </div>
            ) : (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-8 text-sm text-slate-600">
                Генерируем QR...
              </div>
            )}

            <Badge
              variant={
                connectState?.status === "CONNECTED"
                  ? "success"
                  : connectState?.status === "FAILED" || connectState?.status === "EXPIRED"
                    ? "error"
                    : "info"
              }
            >
              {connectLabel}
            </Badge>
          </div>

          <div className="flex gap-2">
            <Button
              variant="ghost"
              onClick={async () => {
                if (!activeLoginSessionId) return;
                await cancelTelegramConnectSession(activeLoginSessionId);
                setActiveLoginSessionId(null);
                setConnectState(null);
                await load();
              }}
            >
              Отменить
            </Button>
          </div>
        </Card>
      ) : null}

      {empty ? null : (
        <div className="grid gap-4">
          {items.map((item) => (
            <Card key={item.id} className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{item.username ? `@${item.username}` : item.displayName || "Рабочий аккаунт"}</p>
                  <p className="text-sm text-slate-600">
                    Статус: {item.status === "CONNECTED" ? "подключён" : item.status.toLowerCase()}
                  </p>
                  {item.connectedAt ? (
                    <p className="text-xs text-slate-500">Подключён: {new Date(item.connectedAt).toLocaleString()}</p>
                  ) : null}
                </div>
                <Badge variant={item.status === "CONNECTED" ? "success" : "warning"}>
                  {item.status}
                </Badge>
              </div>

              <div className="space-y-2">
                <Button
                  variant="secondary"
                  onClick={() => {
                    if (expandedProxyFor === item.id) {
                      setExpandedProxyFor(null);
                      return;
                    }
                    setExpandedProxyFor(item.id);
                    setProxyHost(item.proxyHost || "");
                    setProxyPort(item.proxyPort ? String(item.proxyPort) : "");
                    setProxyUsername(item.proxyUsername || "");
                    setProxyPassword("");
                  }}
                >
                  Настроить proxy
                </Button>

                {expandedProxyFor === item.id ? (
                  <form
                    className="grid gap-3 md:grid-cols-2"
                    onSubmit={async (event) => {
                      event.preventDefault();
                      try {
                        await updateTelegramAccount(item.id, {
                          proxyHost: proxyHost || undefined,
                          proxyPort: proxyPort ? Number(proxyPort) : null,
                          proxyUsername: proxyUsername || undefined,
                          proxyPassword: proxyPassword || undefined
                        });
                        setExpandedProxyFor(null);
                        await load();
                      } catch (e) {
                        setError(mapRawErrorToRu(e instanceof Error ? e.message : "UNKNOWN_ERROR"));
                      }
                    }}
                  >
                    <p className="md:col-span-2 text-sm text-slate-600">
                      Proxy необязателен. Добавьте его, если хотите разделить трафик аккаунтов или повысить стабильность.
                    </p>
                    <Input placeholder="host" value={proxyHost} onChange={(e) => setProxyHost(e.target.value)} />
                    <Input placeholder="port" value={proxyPort} onChange={(e) => setProxyPort(e.target.value)} />
                    <Input
                      placeholder="username"
                      value={proxyUsername}
                      onChange={(e) => setProxyUsername(e.target.value)}
                    />
                    <Input
                      type="password"
                      placeholder="password"
                      value={proxyPassword}
                      onChange={(e) => setProxyPassword(e.target.value)}
                    />
                    <div className="md:col-span-2">
                      <Button type="submit">Сохранить proxy</Button>
                    </div>
                  </form>
                ) : null}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

