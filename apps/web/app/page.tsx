import Link from "next/link";

import Badge from "../components/ui/badge";
import Button from "../components/ui/button";
import Card from "../components/ui/card";

const whatItDoes = [
  {
    title: "Находит новые посты",
    text: "Вы добавляете каналы, а система отслеживает только новые публикации. Старые посты не трогаются."
  },
  {
    title: "Понимает, где стоит писать",
    text: "AI оценивает тему, риск и релевантность, чтобы не комментировать всё подряд."
  },
  {
    title: "Анализирует ваш канал",
    text: "AI изучает ваши посты, стиль и темы, чтобы комментарии в других каналах выглядели как естественное продолжение вашей экспертизы."
  },
  {
    title: "Пишет в вашем стиле",
    text: "Сервис использует базу знаний и ваш Telegram-канал, чтобы комментарии звучали ближе к вам."
  },
  {
    title: "Отправляет аккуратно",
    text: "Комментарии уходят с лимитами, паузами и проверками, чтобы поведение аккаунта выглядело естественно."
  }
];

const audiences = [
  "Эксперты и консультанты",
  "Владельцы Telegram-каналов",
  "Маркетологи и SMM",
  "Создатели digital-продуктов и сервисов"
];

const flowSteps = [
  "Подключите Telegram-аккаунт по QR",
  "Добавьте каналы, где есть ваша аудитория",
  "Заполните AI Context: продукт, стиль, темы, свой канал",
  "Включите AUTO-комментинг",
  "Смотрите отправленные комментарии и результат"
];

const mixModes = [
  {
    title: "Осторожный",
    text: "Больше экспертных комментариев, минимум вопросов. Подходит новым аккаунтам."
  },
  {
    title: "Сбалансированный",
    text: "Оптимальное сочетание экспертных комментариев, мнений и вопросов."
  },
  {
    title: "Активный",
    text: "Больше нейтральных реакций и вопросов для более частого присутствия."
  }
];

const faq = [
  {
    q: "Нужно ли самому подписываться на каналы?",
    a: "Нет. Система может аккуратно подготовить доступ: подписаться на канал и проверить группу обсуждений. Это делается постепенно, с лимитами."
  },
  {
    q: "Комментарии отправляются автоматически?",
    a: "Да, если пост проходит проверку релевантности и безопасности. Спорные случаи могут не отправляться."
  },
  {
    q: "Это не опасно для аккаунта?",
    a: "Сервис использует лимиты, паузы, проверку FloodWait и не комментирует всё подряд. Но любые действия в Telegram зависят от ограничений платформы, поэтому важно использовать аккаунт аккуратно."
  },
  {
    q: "Можно писать не только экспертные комментарии?",
    a: "Да. Есть режим нейтральных комментариев: AI может писать короткие мнения и вопросы, если они уместны."
  },
  {
    q: "Зачем добавлять свой Telegram-канал?",
    a: "Чтобы AI понимал ваши темы, стиль, лексику и позиционирование. Это помогает писать комментарии ближе к вашему голосу."
  }
];

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
        <div className="text-2xl font-semibold">Expert Comment AI</div>
        <Link href="/login">
          <Button variant="ghost">Войти</Button>
        </Link>
      </header>

      <section className="mx-auto w-full max-w-6xl px-6 pb-10">
        <Card className="p-8 md:p-12">
          <Badge variant="info">3 дня бесплатно</Badge>
          <h1 className="mt-4 max-w-5xl text-3xl font-semibold leading-tight md:text-5xl">
            AI, который продвигает ваш Telegram-канал через экспертные комментарии
          </h1>
          <p className="mt-5 max-w-4xl text-lg text-slate-600">
            Сервис изучает ваш канал, понимает темы, стиль и позиционирование, а затем аккуратно находит релевантные
            обсуждения в Telegram и публикует комментарии от вашего имени.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/login">
              <Button>Попробовать бесплатно</Button>
            </Link>
            <a href="#how-it-works">
              <Button variant="secondary">Как это работает</Button>
            </a>
          </div>
        </Card>
      </section>

      <section className="mx-auto w-full max-w-6xl px-6 pb-10">
        <h2 className="mb-4 text-2xl font-semibold">Что делает сервис</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {whatItDoes.map((item) => (
            <Card key={item.title} className="p-6">
              <h3 className="text-xl font-semibold">{item.title}</h3>
              <p className="mt-2 text-slate-600">{item.text}</p>
            </Card>
          ))}
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-6 pb-10">
        <Card className="p-6 md:p-8">
          <h2 className="text-2xl font-semibold">Для кого</h2>
          <p className="mt-2 text-slate-600">
            Если вы продаёте через экспертность и хотите чаще появляться в обсуждениях — сервис помогает делать это
            системно.
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {audiences.map((item) => (
              <div key={item} className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700">
                {item}
              </div>
            ))}
          </div>
        </Card>
      </section>

      <section id="how-it-works" className="mx-auto w-full max-w-6xl px-6 pb-10">
        <h2 className="mb-4 text-2xl font-semibold">Как это работает</h2>
        <div className="grid gap-3">
          {flowSteps.map((step, index) => (
            <Card key={step} className="p-4">
              <p className="text-slate-800">
                <span className="mr-2 font-semibold">{index + 1}.</span>
                {step}
              </p>
            </Card>
          ))}
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-6 pb-10">
        <Card className="p-6 md:p-8">
          <h2 className="text-2xl font-semibold">AI учится на вашем Telegram-канале</h2>
          <p className="mt-3 text-slate-600">
            Добавьте свой канал в AI Context — система проанализирует ваши посты, стиль, темы и офферы. После этого
            комментарии в других каналах будут звучать ближе к вашему голосу и помогать нативно показывать вашу
            экспертизу.
          </p>
          <ul className="mt-4 grid list-disc gap-2 pl-5 text-slate-700 md:grid-cols-2">
            <li>анализ стиля и подачи;</li>
            <li>понимание тем, которые вы развиваете;</li>
            <li>повторяющиеся идеи и аргументы;</li>
            <li>лексика и тональность;</li>
            <li>офферы и направления экспертизы;</li>
            <li>статистика: подписчики, средние просмотры, динамика.</li>
          </ul>
        </Card>
      </section>

      <section className="mx-auto w-full max-w-6xl px-6 pb-10">
        <Card className="p-6 md:p-8">
          <h2 className="text-2xl font-semibold">Ваш канал становится источником экспертности</h2>
          <p className="mt-3 text-slate-600">
            Обычно эксперт сам ищет обсуждения, читает посты и думает, что ответить. Здесь наоборот: AI берёт ваш
            контент как основу, понимает, о чём вы говорите в своём канале, и помогает появляться в чужих обсуждениях
            с комментариями, которые выглядят как продолжение вашей позиции.
          </p>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Card className="p-4">
              <h3 className="font-semibold">Берёт стиль из вашего канала</h3>
              <p className="mt-2 text-sm text-slate-600">Комментарии звучат ближе к тому, как вы пишете сами.</p>
            </Card>
            <Card className="p-4">
              <h3 className="font-semibold">Понимает ваши темы</h3>
              <p className="mt-2 text-sm text-slate-600">AI использует темы, которые вы уже развиваете: услуги, подход, боли клиентов, кейсы.</p>
            </Card>
            <Card className="p-4">
              <h3 className="font-semibold">Нативно показывает экспертизу</h3>
              <p className="mt-2 text-sm text-slate-600">Вместо прямой рекламы — полезные мысли, мнения и вопросы по теме обсуждения.</p>
            </Card>
            <Card className="p-4">
              <h3 className="font-semibold">Следит за динамикой канала</h3>
              <p className="mt-2 text-sm text-slate-600">Видно, как меняются подписчики и средние просмотры после активности.</p>
            </Card>
          </div>
        </Card>
      </section>

      <section className="mx-auto w-full max-w-6xl px-6 pb-10">
        <Card className="p-6 md:p-8">
          <h2 className="text-2xl font-semibold">Не комментирует всё подряд</h2>
          <p className="mt-3 text-slate-600">
            Система пропускает нерелевантные посты, учитывает риск, лимиты аккаунта, паузы между действиями и
            доступность комментариев.
          </p>
          <ul className="mt-4 grid list-disc gap-2 pl-5 text-slate-700 md:grid-cols-2">
            <li>только новые посты;</li>
            <li>фильтр релевантности;</li>
            <li>лимиты на отправку;</li>
            <li>паузы между действиями;</li>
            <li>проверка ошибок Telegram;</li>
            <li>понятные статусы SENT / FAILED / SKIPPED.</li>
          </ul>
        </Card>
      </section>

      <section className="mx-auto w-full max-w-6xl px-6 pb-10">
        <h2 className="mb-4 text-2xl font-semibold">Режимы комментариев</h2>
        <p className="mb-4 text-slate-600">
          Вы можете выбрать стиль поведения: больше экспертных комментариев или более живое присутствие с нейтральными
          мнениями и вопросами.
        </p>
        <div className="grid gap-4 md:grid-cols-3">
          {mixModes.map((mode) => (
            <Card key={mode.title} className="p-5">
              <h3 className="text-lg font-semibold">{mode.title}</h3>
              <p className="mt-2 text-sm text-slate-600">{mode.text}</p>
            </Card>
          ))}
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-6 pb-10">
        <Card className="p-6 md:p-8">
          <Badge variant="success">3 дня бесплатно</Badge>
          <h2 className="mt-3 text-2xl font-semibold">Протестируйте сервис на своих каналах</h2>
          <p className="mt-2 text-slate-600">
            Протестируйте сервис на своих каналах и посмотрите, как AI находит обсуждения и публикует комментарии.
          </p>
          <p className="mt-2 text-sm text-slate-500">После теста доступ подключается вручную через администратора.</p>
          <div className="mt-5">
            <Link href="/login">
              <Button>Начать бесплатно</Button>
            </Link>
          </div>
        </Card>
      </section>

      <section className="mx-auto w-full max-w-6xl px-6 pb-10">
        <h2 className="mb-4 text-2xl font-semibold">FAQ</h2>
        <div className="grid gap-3">
          {faq.map((item) => (
            <Card key={item.q} className="p-5">
              <h3 className="font-semibold">{item.q}</h3>
              <p className="mt-2 text-sm text-slate-600">{item.a}</p>
            </Card>
          ))}
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-6 pb-16">
        <Card className="p-8 text-center md:p-12">
          <h2 className="text-3xl font-semibold">Начните появляться в Telegram-обсуждениях системно</h2>
          <p className="mx-auto mt-3 max-w-3xl text-slate-600">
            Подключите аккаунт, добавьте каналы и дайте AI делать то, что обычно отнимает часы ручной работы. Сервис
            помогает чаще появляться в релевантных обсуждениях и отслеживать динамику канала.
          </p>
          <div className="mt-6">
            <Link href="/login">
              <Button>Попробовать бесплатно</Button>
            </Link>
          </div>
        </Card>
      </section>
    </main>
  );
}
