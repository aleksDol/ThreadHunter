"use client";

import { useEffect, useMemo, useState } from "react";

import Badge, { statusBadgeVariant } from "../../../components/ui/badge";
import Button from "../../../components/ui/button";
import Card from "../../../components/ui/card";
import ErrorAlert from "../../../components/ui/error-alert";
import {
  adminGetUser,
  adminListUsers,
  adminPatchWorkspaceBilling,
  getMe,
  type AdminUserDetails,
  type AdminUserListItem
} from "../../../src/lib/api-client";
import { mapRawErrorToRu } from "../../../src/lib/error-messages";

function fmtDate(value: string | null | undefined): string {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

export default function AdminPage() {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [users, setUsers] = useState<AdminUserListItem[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<AdminUserDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const selectedWorkspaceId = selectedUser?.workspace?.id ?? null;

  const selectedSummary = useMemo(() => {
    if (!selectedUser?.workspace) return null;
    return {
      plan: selectedUser.workspace.plan,
      subscriptionStatus: selectedUser.workspace.subscriptionStatus,
      trialEndsAt: selectedUser.workspace.trialEndsAt,
      commentLimit: selectedUser.workspace.commentLimit,
      commentsSentCount: selectedUser.workspace.commentsSentCount
    };
  }, [selectedUser]);

  async function loadUsers() {
    setLoading(true);
    try {
      const me = await getMe();
      if (!me.user.isAdmin) {
        setIsAdmin(false);
        setLoading(false);
        return;
      }

      setIsAdmin(true);
      const list = await adminListUsers();
      setUsers(list);
      if (!selectedUserId && list.length > 0) {
        setSelectedUserId(list[0].userId);
      }
    } catch (e) {
      setError(mapRawErrorToRu(e instanceof Error ? e.message : "UNKNOWN_ERROR"));
    } finally {
      setLoading(false);
    }
  }

  async function loadUserDetails(userId: string) {
    setLoading(true);
    setError(null);
    try {
      const details = await adminGetUser(userId);
      setSelectedUser(details);
    } catch (e) {
      setError(mapRawErrorToRu(e instanceof Error ? e.message : "UNKNOWN_ERROR"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadUsers().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!selectedUserId || isAdmin !== true) return;
    loadUserDetails(selectedUserId).catch(() => undefined);
  }, [selectedUserId, isAdmin]);

  async function applyBillingPatch(payload: {
    plan?: "trial" | "pro" | "blocked";
    subscriptionStatus?: "trialing" | "active" | "blocked" | "expired";
    trialEndsAt?: string | null;
    commentLimit?: number;
    commentsSentCount?: number;
  }, successText: string) {
    if (!selectedWorkspaceId || !selectedUserId) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await adminPatchWorkspaceBilling(selectedWorkspaceId, payload);
      await Promise.all([loadUserDetails(selectedUserId), loadUsers()]);
      setSuccess(successText);
    } catch (e) {
      setError(mapRawErrorToRu(e instanceof Error ? e.message : "UNKNOWN_ERROR"));
    } finally {
      setSaving(false);
    }
  }

  if (isAdmin === false) {
    return (
      <Card>
        <h2 className="text-xl font-semibold">403</h2>
        <p className="mt-2 text-slate-600">У вас нет доступа к админке.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="space-y-2">
        <h2 className="text-xl font-semibold">Управление доступом</h2>
        <p className="text-sm text-slate-600">Ручная активация/блокировка workspace после оплаты.</p>
      </Card>

      {error ? <ErrorAlert message={error} /> : null}
      {success ? <p className="text-sm text-emerald-700">{success}</p> : null}

      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <Card className="space-y-3">
          <h3 className="text-lg font-semibold">Пользователи</h3>
          {loading && users.length === 0 ? <p className="text-sm text-slate-500">Загрузка...</p> : null}
          <div className="space-y-3">
            {users.map((item) => (
              <div
                key={item.userId}
                className={`rounded-xl border p-3 ${selectedUserId === item.userId ? "border-blue-400 bg-blue-50" : "border-slate-200"}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">{item.email || "(без email)"}</p>
                  <Button variant="secondary" onClick={() => setSelectedUserId(item.userId)}>
                    Открыть
                  </Button>
                </div>
                <div className="mt-2 grid gap-1 text-sm text-slate-600">
                  <p>Plan: {item.workspace?.plan || "-"}</p>
                  <p>Subscription: {item.workspace?.subscriptionStatus || "-"}</p>
                  <p>Комментарии: {item.workspace ? `${item.workspace.commentsSentCount} / ${item.workspace.commentLimit}` : "-"}</p>
                  <p>Telegram verified: {item.telegramVerifiedAt ? "Да" : "Нет"}</p>
                  <p>Регистрация: {fmtDate(item.createdAt)}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="space-y-4">
          <h3 className="text-lg font-semibold">Карточка пользователя</h3>
          {!selectedUser ? <p className="text-sm text-slate-500">Выберите пользователя.</p> : null}
          {selectedUser ? (
            <>
              <div className="space-y-1 text-sm">
                <p><strong>Email:</strong> {selectedUser.user.email || "-"}</p>
                <p><strong>Создан:</strong> {fmtDate(selectedUser.user.createdAt)}</p>
                <p><strong>Plan:</strong> {selectedSummary?.plan || "-"}</p>
                <p><strong>Subscription:</strong> {selectedSummary?.subscriptionStatus || "-"}</p>
                <p><strong>Trial ends:</strong> {fmtDate(selectedSummary?.trialEndsAt)}</p>
                <p><strong>Comment limit:</strong> {selectedSummary?.commentLimit ?? "-"}</p>
                <p><strong>Comments sent:</strong> {selectedSummary?.commentsSentCount ?? "-"}</p>
                <p><strong>Telegram accounts:</strong> {selectedUser.stats?.telegramAccounts.total ?? 0}</p>
                <p><strong>Monitored channels:</strong> {selectedUser.stats?.monitoredChannels.total ?? 0}</p>
                <p><strong>Owned channels:</strong> {selectedUser.stats?.ownedChannelsCount ?? 0}</p>
              </div>

              {selectedSummary?.subscriptionStatus ? (
                <Badge variant={statusBadgeVariant(selectedSummary.subscriptionStatus)}>
                  {selectedSummary.subscriptionStatus}
                </Badge>
              ) : null}

              <div className="space-y-2">
                <Button
                  disabled={saving || !selectedWorkspaceId}
                  onClick={() =>
                    applyBillingPatch(
                      { plan: "pro", subscriptionStatus: "active", commentLimit: 1000 },
                      "Доступ открыт"
                    )
                  }
                >
                  Открыть доступ
                </Button>
                <Button
                  variant="secondary"
                  disabled={saving || !selectedWorkspaceId}
                  onClick={() =>
                    applyBillingPatch(
                      { plan: "blocked", subscriptionStatus: "blocked" },
                      "Доступ заблокирован"
                    )
                  }
                >
                  Заблокировать
                </Button>
                <Button
                  variant="secondary"
                  disabled={saving || !selectedWorkspaceId}
                  onClick={() => {
                    const plus3Days = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
                    applyBillingPatch(
                      { plan: "trial", subscriptionStatus: "trialing", trialEndsAt: plus3Days },
                      "Trial продлён на 3 дня"
                    );
                  }}
                >
                  Продлить trial на 3 дня
                </Button>
                <Button
                  variant="secondary"
                  disabled={saving || !selectedWorkspaceId}
                  onClick={() => applyBillingPatch({ commentsSentCount: 0 }, "Счётчик commentsSentCount сброшен")}
                >
                  Сбросить commentsSentCount
                </Button>
              </div>
            </>
          ) : null}
        </Card>
      </div>
    </div>
  );
}

