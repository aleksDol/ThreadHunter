"use client";

import { useEffect, useState } from "react";

import Button from "../../../components/ui/button";
import Card from "../../../components/ui/card";
import ErrorAlert from "../../../components/ui/error-alert";
import { getWorkspaceSettings, updateWorkspaceSettings } from "../../../src/lib/api-client";
import { mapRawErrorToRu } from "../../../src/lib/error-messages";

type CommentMixPreset = "cautious" | "balanced" | "active";

export default function SettingsPage() {
  const [neutralCommentsEnabled, setNeutralCommentsEnabled] = useState(false);
  const [commentMixPreset, setCommentMixPreset] = useState<CommentMixPreset>("balanced");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const settings = await getWorkspaceSettings();
    setNeutralCommentsEnabled(settings.neutralCommentsEnabled);
    setCommentMixPreset(settings.commentMixPreset);
    setLoading(false);
  }

  useEffect(() => {
    load().catch((e) => {
      setError(mapRawErrorToRu(e instanceof Error ? e.message : "UNKNOWN_ERROR"));
      setLoading(false);
    });
  }, []);

  async function onSave() {
    setSaving(true);
    setError(null);
    try {
      const updated = await updateWorkspaceSettings({ neutralCommentsEnabled, commentMixPreset });
      setNeutralCommentsEnabled(updated.neutralCommentsEnabled);
      setCommentMixPreset(updated.commentMixPreset);
    } catch (e) {
      setError(mapRawErrorToRu(e instanceof Error ? e.message : "UNKNOWN_ERROR"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {error ? <ErrorAlert message={error} /> : null}
      <Card>
        <h2 className="mb-2 text-lg font-semibold">Нейтральные комментарии</h2>
        <p className="mb-4 text-sm text-slate-600">
          Если включено, AI сможет оставлять не только экспертные комментарии, но и короткие мнения, уточняющие
          вопросы и нейтральные реакции по теме поста.
        </p>

        <label className="flex items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={neutralCommentsEnabled}
            onChange={(e) => setNeutralCommentsEnabled(e.target.checked)}
            disabled={loading || saving}
          />
          Включить нейтральные комментарии
        </label>

        {neutralCommentsEnabled ? (
          <div className="mt-5 space-y-3">
            <h3 className="text-base font-semibold">Режим комментариев</h3>

            <label className="block rounded-xl border border-slate-200 p-3 text-sm">
              <input type="radio" name="mix" className="mr-2" checked={commentMixPreset === "cautious"} onChange={() => setCommentMixPreset("cautious")} />
              <span className="font-medium">Осторожный</span>
              <p className="mt-1 text-slate-600">Больше экспертных комментариев, минимум вопросов. Подходит новым аккаунтам.</p>
              <p className="mt-1 text-slate-500">80 / 15 / 5</p>
            </label>

            <label className="block rounded-xl border border-slate-200 p-3 text-sm">
              <input type="radio" name="mix" className="mr-2" checked={commentMixPreset === "balanced"} onChange={() => setCommentMixPreset("balanced")} />
              <span className="font-medium">Сбалансированный</span>
              <p className="mt-1 text-slate-600">Оптимальное соотношение экспертных комментариев, мнений и вопросов.</p>
              <p className="mt-1 text-slate-500">60 / 25 / 15</p>
            </label>

            <label className="block rounded-xl border border-slate-200 p-3 text-sm">
              <input type="radio" name="mix" className="mr-2" checked={commentMixPreset === "active"} onChange={() => setCommentMixPreset("active")} />
              <span className="font-medium">Активный</span>
              <p className="mt-1 text-slate-600">Больше нейтральных мнений и вопросов для более живого присутствия.</p>
              <p className="mt-1 text-slate-500">40 / 35 / 25</p>
            </label>
          </div>
        ) : null}

        <div className="mt-4">
          <Button onClick={onSave} disabled={loading || saving}>
            {saving ? "Сохраняем..." : "Сохранить"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
