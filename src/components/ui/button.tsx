import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold transition-all duration-150 select-none active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950 disabled:pointer-events-none disabled:opacity-45",
  {
    variants: {
      variant: {
        default:
          "bg-gradient-to-b from-brand-400 to-brand-600 text-white shadow-[0_6px_20px_-8px_rgb(232_38_94/0.7)] hover:from-brand-300 hover:to-brand-500 hover:shadow-[0_8px_28px_-8px_rgb(232_38_94/0.85)]",
        secondary: "border border-neutral-700/80 bg-neutral-800 text-neutral-100 hover:border-neutral-600 hover:bg-neutral-700",
        outline: "border border-neutral-700 bg-transparent text-neutral-100 hover:border-brand-500/60 hover:bg-brand-500/10",
        ghost: "text-neutral-300 hover:bg-neutral-800 hover:text-neutral-50",
        destructive: "bg-red-600 text-white hover:bg-red-500",
        iris: "bg-gradient-to-b from-iris-400 to-iris-600 text-white shadow-[0_6px_20px_-8px_rgb(91_91_246/0.7)] hover:brightness-110",
      },
      size: {
        default: "h-10 px-5",
        sm: "h-8 px-3 text-[13px]",
        lg: "h-11 px-6 text-[15px]",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  ref?: React.Ref<HTMLButtonElement>;
}

export function Button({ className, variant, size, asChild, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
