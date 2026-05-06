import Link from "next/link";
import Button from "../components/ui/button";
import Card from "../components/ui/card";

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
        <div className="text-2xl font-semibold">Expert Comment AI</div>
        <Link href="/login">
          <Button variant="ghost">Login</Button>
        </Link>
      </header>

      <section className="mx-auto w-full max-w-6xl px-6 pb-10">
        <Card className="p-10 md:p-14">
          <h1 className="max-w-4xl text-4xl font-semibold leading-tight md:text-6xl">
            Automatic Telegram comments that bring clients
          </h1>
          <p className="mt-6 max-w-3xl text-lg text-slate-600">
            The system finds relevant discussions in Telegram and publishes expert comments on your behalf.
          </p>
          <div className="mt-8">
            <Link href="/login">
              <Button>Start free</Button>
            </Link>
          </div>
        </Card>
      </section>

      <section className="mx-auto grid w-full max-w-6xl gap-4 px-6 pb-16 md:grid-cols-3">
        <Card className="p-6">
          <p className="text-sm text-slate-500">Step 1</p>
          <h2 className="mt-2 text-2xl font-semibold">Connect Telegram</h2>
          <p className="mt-2 text-slate-600">Connect your account and keep it active.</p>
        </Card>
        <Card className="p-6">
          <p className="text-sm text-slate-500">Step 2</p>
          <h2 className="mt-2 text-2xl font-semibold">Add channels and knowledge</h2>
          <p className="mt-2 text-slate-600">Choose channels and provide product context.</p>
        </Card>
        <Card className="p-6">
          <p className="text-sm text-slate-500">Step 3</p>
          <h2 className="mt-2 text-2xl font-semibold">Approve and send</h2>
          <p className="mt-2 text-slate-600">Review comments and send with safety limits.</p>
        </Card>
      </section>
    </main>
  );
}
