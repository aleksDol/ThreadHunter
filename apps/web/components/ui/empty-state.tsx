import Link from "next/link";
import type { Route } from "next";
import Card from "./card";
import Button from "./button";

export default function EmptyState({
  title,
  description,
  ctaLabel,
  ctaHref
}: {
  title: string;
  description: string;
  ctaLabel?: string;
  ctaHref?: Route;
}) {
  return (
    <Card className="text-center">
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="mt-2 text-sm text-slate-600">{description}</p>
      {ctaLabel && ctaHref ? (
        <div className="mt-4">
          <Link href={ctaHref}>
            <Button>{ctaLabel}</Button>
          </Link>
        </div>
      ) : null}
    </Card>
  );
}
