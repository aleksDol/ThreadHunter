"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import Button from "../../components/ui/button";
import Card from "../../components/ui/card";
import ErrorAlert from "../../components/ui/error-alert";
import Input from "../../components/ui/input";
import { ApiError, loginWithEmail, registerWithEmail } from "../../src/lib/api-client";

type Mode = "register" | "login";

function getLoginErrorMessage(error: unknown, mode: Mode): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return "Неверный email или пароль";
    if (error.status === 409) return "Пользователь с таким email уже существует";
    if (error.status === 429) return "Слишком много попыток. Попробуйте позже";
    if (error.status >= 500) return "Не удалось выполнить действие. Попробуйте ещё раз";
  }

  if (error instanceof TypeError) {
    return "Не удалось подключиться к серверу. Проверьте соединение";
  }

  return mode === "login"
    ? "Не удалось выполнить вход. Попробуйте ещё раз"
    : "Не удалось выполнить регистрацию. Попробуйте ещё раз";
}

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("register");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const payload = { email: email.trim().toLowerCase(), password };
      if (mode === "register") {
        await registerWithEmail(payload);
      } else {
        await loginWithEmail(payload);
      }

      router.push("/dashboard");
      router.refresh();
    } catch (submitError) {
      setError(getLoginErrorMessage(submitError, mode));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <Card className="w-full max-w-md space-y-6 p-8">
        <div>
          <h1 className="text-2xl font-semibold">Вход в Expert Comment AI</h1>
          <p className="mt-2 text-sm text-slate-600">Войдите по email и паролю, чтобы управлять рабочими Telegram-аккаунтами и AUTO-комментингом.</p>
        </div>

        <div className="flex gap-2">
          <Button type="button" variant={mode === "register" ? "primary" : "secondary"} onClick={() => setMode("register")}>Регистрация</Button>
          <Button type="button" variant={mode === "login" ? "primary" : "secondary"} onClick={() => setMode("login")}>Вход</Button>
        </div>

        <form onSubmit={onSubmit} className="space-y-3">
          <Input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Input
            type="password"
            placeholder="Пароль (минимум 8 символов)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <Button className="w-full" type="submit" disabled={loading}>
            {loading ? "Подождите..." : mode === "register" ? "Создать аккаунт" : "Войти"}
          </Button>
        </form>

        {error ? <ErrorAlert message={error} /> : null}
      </Card>
    </div>
  );
}
