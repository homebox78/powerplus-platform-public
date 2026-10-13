import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// docs/03 §3 Tag: h-6 px-[9px] pill 12/600 — line / ink / ok / warn / soft / dash
const tagVariants = cva(
  "inline-flex h-6 shrink-0 items-center whitespace-nowrap rounded-chip px-[9px] text-xs font-semibold",
  {
    variants: {
      tone: {
        line: "border border-line-3 bg-white text-ink-3",
        ink: "bg-ink text-white",
        ok: "bg-ok-soft text-ok",
        warn: "bg-warn-soft text-warn",
        soft: "bg-ground-3 text-ink-2",
        dash: "border border-dashed border-warn bg-white text-warn",
      },
    },
    defaultVariants: { tone: "line" },
  },
);

export interface TagProps extends React.ComponentProps<"span">, VariantProps<typeof tagVariants> {}

export function Tag({ className, tone, ...props }: TagProps) {
  return <span data-slot="tag" className={cn(tagVariants({ tone }), className)} {...props} />;
}

/** PRO 배지: h-[22px] px-[9px] bg-ink 11/800 tracking .06em */
export function ProBadge({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      className={cn("inline-flex h-[22px] items-center rounded-chip bg-point px-[9px] pt-0.5 text-[11px] leading-none font-extrabold tracking-[.06em] text-white", className)}
      {...props}
    >
      PRO
    </span>
  );
}
