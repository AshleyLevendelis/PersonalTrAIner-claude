import { Button } from '@/components/ui/button'

// ---------------------------------------------------------------------------
// THE WELCOME PAGE (his request 24 Nov 2026, option 1, "build it. Make the one line good. Something that really sells
// it"). Shown whenever this phone holds no plan and no setup in progress: the very first open, and after signing out.
// Before it, the app dropped straight into the setup chat, with "Already have an account?" a small link under it.
//
// Every claim in WELCOME_LINE is something the app does today: the plan and the meals are built from his answers, the
// chat coach can be messaged at any time, and sessions and meals can be moved, swapped and resized when his week
// changes. Never a wall: Get started opens setup at once, and nobody must sign in.
// ---------------------------------------------------------------------------

export const WELCOME_HEADLINE = 'A personal trainer in your pocket'
export const WELCOME_LINE =
  'Workouts and meals built around you, a coach you can text any time, and a plan that changes when your week does.'

export function WelcomeScreen({ onStart, onSignIn }: { onStart: () => void; onSignIn: () => void }) {
  return (
    <div
      className="min-h-screen bg-background flex flex-col px-6 pt-[calc(env(safe-area-inset-top,0px)+3rem)] pb-[calc(env(safe-area-inset-bottom,0px)+2rem)]"
      data-testid="welcome"
    >
      <div className="flex-1 flex flex-col items-center justify-center text-center gap-5 max-w-sm w-full mx-auto">
        <img src="/icon-192.png" alt="" width={88} height={88} className="rounded-[22px] shadow-lg" />
        <p className="text-sm font-semibold tracking-[.02em] text-primary-text">Personal TrAIner</p>
        <h1 className="text-[2rem] font-bold leading-[1.1] tracking-[-.03em] text-balance">{WELCOME_HEADLINE}</h1>
        <p className="text-base text-muted-foreground leading-relaxed">{WELCOME_LINE}</p>
      </div>
      <div className="max-w-sm w-full mx-auto flex flex-col gap-3">
        <Button className="w-full min-h-[52px] text-base font-semibold" onClick={onStart} data-welcome-start>
          Get started
        </Button>
        <Button variant="outline" className="w-full min-h-[48px]" onClick={onSignIn} data-welcome-signin>
          I already have an account
        </Button>
      </div>
    </div>
  )
}
