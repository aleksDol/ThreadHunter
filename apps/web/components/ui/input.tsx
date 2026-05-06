import { forwardRef, InputHTMLAttributes } from "react";
import { cn } from "../../src/lib/cn";

const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => {
  return (
    <input
      ref={ref}
      className={cn(
        "w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition placeholder:text-slate-400 focus:border-accent-500 focus:ring-2 focus:ring-accent-100",
        className
      )}
      {...props}
    />
  );
});

Input.displayName = "Input";

export default Input;
