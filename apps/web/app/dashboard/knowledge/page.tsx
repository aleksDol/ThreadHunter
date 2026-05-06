"use client";

import { FormEvent, useEffect, useState } from "react";

import Button from "../../../components/ui/button";
import Card from "../../../components/ui/card";
import EmptyState from "../../../components/ui/empty-state";
import ErrorAlert from "../../../components/ui/error-alert";
import Input from "../../../components/ui/input";
import {
  createKnowledgeBase,
  deleteKnowledgeBase,
  listKnowledgeBase,
  type KnowledgeBaseItem
} from "../../../src/lib/api-client";
import { mapRawErrorToRu } from "../../../src/lib/error-messages";

export default function KnowledgePage() {
  const [items, setItems] = useState<KnowledgeBaseItem[]>([]);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const data = await listKnowledgeBase();
    setItems(data);
  }

  useEffect(() => {
    load().catch((e) => setError(mapRawErrorToRu(e instanceof Error ? e.message : "UNKNOWN_ERROR")));
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    try {
      await createKnowledgeBase({ title, content });
      setTitle("");
      setContent("");
      await load();
    } catch (e) {
      setError(mapRawErrorToRu(e instanceof Error ? e.message : "UNKNOWN_ERROR"));
    }
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-600">
        Чем конкретнее база знаний, тем лучше комментарии. Добавьте услуги, кейсы, боли клиентов и тон общения.
      </p>
      {error ? <ErrorAlert message={error} /> : null}

      <Card>
        <h2 className="mb-4 text-lg font-semibold">Добавить запись в базу знаний</h2>
        <form onSubmit={onSubmit} className="space-y-3">
          <Input placeholder="Заголовок" value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={120} />
          <textarea
            className="min-h-36 w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-accent-500 focus:ring-2 focus:ring-accent-100"
            placeholder="Содержание"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            required
            maxLength={12000}
          />
          <Button type="submit">Сохранить базу</Button>
        </form>
      </Card>

      {items.length === 0 ? (
        <EmptyState
          title="Добавьте базу знаний"
          description="Опишите ваш продукт, нишу, опыт и стиль общения. На основе этого AI будет писать экспертные комментарии."
          ctaLabel="Добавить базу"
          ctaHref="/dashboard/knowledge"
        />
      ) : (
        <div className="grid gap-4">
          {items.map((item) => (
            <Card key={item.id} className="flex items-start justify-between gap-4">
              <div>
                <p className="font-medium">{item.title}</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{item.content}</p>
                <p className="mt-2 text-sm text-slate-600">Обновлено: {new Date(item.updatedAt).toLocaleString()}</p>
              </div>
              <Button
                variant="secondary"
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
      )}
    </div>
  );
}
