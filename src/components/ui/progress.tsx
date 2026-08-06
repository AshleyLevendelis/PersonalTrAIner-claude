import * as React from "react"
import * as ProgressPrimitive from "@radix-ui/react-progress"
import { cn } from "@/lib/utils"

function Progress({
  className,
  value,
  glow = false,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root> & {
  /**
   * Density pass 3a: the macro tiles' 3px fill throws a mint halo. That
   * requires dropping the track's `overflow-hidden` (which would clip the
   * spill), so it's opt-in rather than the default — every other Progress in
   * the app still wants the clipped track.
   */
  glow?: boolean
}) {
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      className={cn(
        "relative h-2 w-full rounded-full bg-border",
        !glow && "overflow-hidden",
        className
      )}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className={cn("h-full w-full flex-1 bg-primary transition-all rounded-full", glow && "glow-mint-box")}
        style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
      />
    </ProgressPrimitive.Root>
  )
}

export { Progress }
