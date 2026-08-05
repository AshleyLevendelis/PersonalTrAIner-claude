import * as React from "react"
import { cn } from "@/lib/utils"

// Nightshift's two recurring banner patterns: "ai" is the assistant's own
// voice (coach tips, chat's own bubbles), "warning" is a needs-your-attention
// nudge (unlogged meals, ramp/calibration notes). Centralized here so both
// tones read identically everywhere they appear rather than five hand-rolled
// color choices per screen.
export interface InsightBannerProps extends React.ComponentProps<"div"> {
  tone: "ai" | "warning"
}

function InsightBanner({ tone, className, children, ...props }: InsightBannerProps) {
  return (
    <div
      data-slot="insight-banner"
      className={cn(
        "flex gap-2.5 rounded-2xl border px-4 py-3.5 text-[13.5px] leading-[1.45]",
        tone === "ai" && "border-[color:var(--role-ai-border)] bg-[color:var(--role-ai-bg)] text-[color:var(--role-ai-text)]",
        tone === "warning" && "border-[color:var(--role-warn-border)] bg-[color:var(--role-warn-bg)] text-[color:var(--role-warn-text)]",
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

export { InsightBanner }
