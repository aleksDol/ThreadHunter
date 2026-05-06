"use client";

import { useEffect, useMemo, useState } from "react";

import Button from "../../../components/ui/button";
import Card from "../../../components/ui/card";
import ErrorAlert from "../../../components/ui/error-alert";
import { getBillingStatus, type BillingStatus } from "../../../src/lib/api-client";

export default function BillingPage() {
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const paymentContactUrl = process.env.NEXT_PUBLIC_PAYMENT_CONTACT_URL || "#";

  useEffect(() => {
    getBillingStatus()
      .then(setBilling)
      .catch((e) => setError(e instanceof Error ? e.message : "Load failed"));
  }, []);

  const trialDaysLeft = useMemo(() => {
    if (!billing?.trialEndsAt) return null;
    const diffMs = new Date(billing.trialEndsAt).getTime() - Date.now();
    return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
  }, [billing]);

  return (
    <div className="space-y-4">
      {error ? <ErrorAlert message={error} /> : null}
      {billing ? (
        <Card className="space-y-2">
          <p>Plan: <strong>{billing.plan}</strong></p>
          <p>Subscription: <strong>{billing.subscriptionStatus}</strong></p>
          <p>Trial days left: {trialDaysLeft ?? "-"}</p>
          <p>Comments: {billing.commentsSentCount} / {billing.commentLimit}</p>
          {!billing.canDispatch && billing.blockReason ? <ErrorAlert message={billing.blockReason} /> : null}
          <a href={paymentContactUrl} target="_blank" rel="noreferrer">
            <Button>Contact for payment</Button>
          </a>
        </Card>
      ) : null}
    </div>
  );
}
