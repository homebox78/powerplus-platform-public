import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import { cn } from "@/lib/utils";

// docs/03 §3 Button — 전부 pill. Primary = ink 배경 흰 글자, Secondary(outline) = 흰 배경 line-3 테두리.
// 높이 lg 48 / md 44 / sm 36 / xs 32 (design/generator lib.btn과 1:1). 같은 줄의 컨트롤은 같은 size를 쓸 것.
const buttonVariants = cva(
  "group/button inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap rounded-chip border font-bold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "border-ink bg-ink text-white hover:bg-ink-2 hover:border-ink-2",
        outline: "border-line-3 bg-white text-ink hover:bg-ground-2 aria-expanded:bg-ground-3",
        ghost: "border-transparent bg-transparent text-ink hover:bg-ground-3 aria-expanded:bg-ground-3",
        soft: "border-ground-3 bg-ground-3 text-ink hover:bg-ground-4 hover:border-ground-4",
        white: "border-white bg-white text-ink hover:bg-ground-2",
        dark: "border-dark bg-dark text-white hover:bg-dark-2 hover:border-dark-2",
        destructive: "border-warn-soft bg-warn-soft text-warn hover:bg-warn/15",
        link: "h-auto border-transparent bg-transparent px-0 text-ink underline-offset-4 hover:underline",
      },
      size: {
        lg: "h-11 gap-2 px-5 text-md [&_svg:not([class*='size-'])]:size-4",
        md: "h-10 gap-2 px-[18px] text-sm [&_svg:not([class*='size-'])]:size-4",
        sm: "h-9 gap-1.5 px-4 text-sm [&_svg:not([class*='size-'])]:size-3.5",
        xs: "h-8 gap-1 px-3 text-xs [&_svg:not([class*='size-'])]:size-3.5",
        icon: "size-10 [&_svg:not([class*='size-'])]:size-[18px]",
        "icon-lg": "size-11 [&_svg:not([class*='size-'])]:size-[18px]",
        "icon-sm": "size-9 [&_svg:not([class*='size-'])]:size-4",
      },
    },
    defaultVariants: { variant: "default", size: "md" },
  },
);

function Button({
  className,
  variant = "default",
  size = "md",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
