"use client";

import { useRouter } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";

import Button from "../../../components/ui/button";
import Card from "../../../components/ui/card";
import ErrorAlert from "../../../components/ui/error-alert";
import { UnauthorizedError, apiFetch } from "../../../src/lib/api-client";
import { mapRawErrorToRu } from "../../../src/lib/error-messages";

type MeResponse = {
  user: {
    id: string;
    telegramId: string;
    username: string | null;
    firstName: string | null;
  };
  workspace: {
    id: string;
    name: string;
  };
  role: "owner";
};

export default function AuthGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [requestKey, setRequestKey] = useState(0);

  useEffect(() => {
    let mounted = true;
    setReady(false);
    setSessionError(null);

    apiFetch<MeResponse>("/auth/me")
      .then(() => {
        if (mounted) setReady(true);
      })
      .catch((error) => {
        if (error instanceof UnauthorizedError) {
          router.replace("/login");
          return;
        }

        if (mounted) {
          setSessionError(mapRawErrorToRu(error instanceof Error ? error.message : "UNKNOWN_ERROR"));
        }
      });

    return () => {
      mounted = false;
    };
  }, [router, requestKey]);

  if (sessionError) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <Card className="w-full max-w-md space-y-4">
          <ErrorAlert message="Не удалось проверить сессию" />
          <p className="text-sm text-slate-600">Проверьте соединение или попробуйте обновить страницу.</p>
          <p className="text-xs text-slate-500">{sessionError}</p>
          <div className="flex gap-2">
            <Button onClick={() => setRequestKey((v) => v + 1)}>Обновить</Button>
            <Button variant="secondary" onClick={() => router.replace("/login")}>Войти заново</Button>
          </div>
        </Card>
      </div>
    );
  }

  if (!ready) {
    return <p className="p-6 text-sm text-slate-600">Проверяем сессию...</p>;
  }

  return <>{children}</>;
}
