import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-xs hover:bg-primary/90",
        destructive: "bg-destructive text-white shadow-xs hover:bg-destructive/90",
        outline: "border border-input bg-background shadow-xs hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      // EVERY SIZE BELOW 44px CARRIES hit-slop-44, which is where this
      // belongs rather than at each call site. Measured across the four tabs
      // at 390x844: 26 of 91 rendered controls could not be hit across a 44px
      // thumb reach — "Save" on the weigh-in at 20px, the water buttons at
      // 16px, "Add Set" at 24px. Apple's minimum is 44pt, Android's 48dp.
      //
      // h-9 is 36px, h-8 is 32px, h-6 is 24px, size-10 is 40px: all short.
      // Only `cta` (52px) is genuinely big enough. The slop is an invisible
      // ::after — it expands the TOUCH area and moves nothing on screen, so
      // this changes no layout anywhere in the app.
      size: {
        default: "h-9 px-4 py-2 hit-slop-44",
        xs: "h-6 rounded px-2 text-xs hit-slop-44",
        sm: "h-8 rounded-md px-3 text-xs hit-slop-44",
        lg: "h-10 rounded-md px-6 hit-slop-44",
        cta: "h-[52px] rounded-[14px] px-6 text-base font-semibold",
        icon: "size-9 hit-slop-44",
        "icon-xs": "size-6 hit-slop-44",
        "icon-sm": "size-8 hit-slop-44",
        "icon-lg": "size-10 hit-slop-44",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button"
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
