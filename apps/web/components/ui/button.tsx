import { ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "../../src/lib/cn";

type Variant = "primary" | "secondary" | "ghost";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
};

const variantClasses: Record<Variant, string> = {
  primary: "bg-accent-600 text-white hover:bg-accent-700",
  secondary: "bg-slate-100 text-slate-800 hover:bg-slate-200",
  ghost: "bg-transparent text-slate-700 hover:bg-slate-100"
};

const Button = forwardRef<HTMLButtonElement, Props>(({ className, variant = "primary", ...props }, ref) => {
  return (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center rounded-2xl px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60",
        variantClasses[variant],
        className
      )}
      {...props}
    />
  );
});

Button.displayName = "Button";

export default Button;
