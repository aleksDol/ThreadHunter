"use client";

import { useEffect, useState } from "react";

import Button from "../../../components/ui/button";
import Card from "../../../components/ui/card";
import ErrorAlert from "../../../components/ui/error-alert";
import { getWorkspaceSettings, updateWorkspaceSettings } from "../../../src/lib/api-client";
import { mapRawErrorToRu } from "../../../src/lib/error-messages";

export default function SettingsPage() {
  const [neutralCommentsEnabled, setNeutralCommentsEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const settings = await getWorkspaceSettings();
    setNeutralCommentsEnabled(settings.neutralCommentsEnabled);
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
      const updated = await updateWorkspaceSettings({ neutralCommentsEnabled });
      setNeutralCommentsEnabled(updated.neutralCommentsEnabled);
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
          вопросы и нейтральные реакции по теме поста. Это увеличивает активность и делает поведение аккаунта более
          естественным.
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

        <p className="mt-3 text-sm text-slate-600">Экспертные комментарии остаются приоритетными.</p>

        <div className="mt-4">
          <Button onClick={onSave} disabled={loading || saving}>
            {saving ? "Сохраняем..." : "Сохранить"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
