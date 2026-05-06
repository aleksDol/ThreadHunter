import { cn } from "../../src/lib/cn";

type BadgeVariant = "success" | "error" | "warning" | "info" | "neutral";

const variants: Record<BadgeVariant, string> = {
  success: "bg-emerald-100 text-emerald-700",
  error: "bg-rose-100 text-rose-700",
  warning: "bg-amber-100 text-amber-700",
  info: "bg-blue-100 text-blue-700",
  neutral: "bg-slate-200 text-slate-700"
};

export default function Badge({
  children,
  variant = "neutral",
  className
}: {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold", variants[variant], className)}>
      {children}
    </span>
  );
}

export function statusBadgeVariant(status: string): BadgeVariant {
  const normalized = status.toUpperCase();
  if (normalized === "SENT") return "success";
  if (normalized === "FAILED") return "error";
  if (normalized === "QUEUED" || normalized === "READY" || normalized === "SCHEDULED") return "info";
  if (normalized === "DRAFT") return "neutral";
  return "warning";
}
