import { HTMLAttributes } from "react";
import { cn } from "../../src/lib/cn";

export default function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-2xl border border-slate-200 bg-white p-5 shadow-sm", className)} {...props} />;
}
