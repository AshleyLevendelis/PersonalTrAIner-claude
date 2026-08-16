import { useState } from 'react'
import { Dumbbell } from 'lucide-react'
import { OptionCard } from './OptionCard'
import { OnboardingFlow } from './OnboardingFlow'
import { ConversationalOnboarding } from './ConversationalOnboarding'
import { hasOnboardingDraft, clearOnboardingDraft } from '@/lib/onboarding-draft-store'
import type { UserProfile } from '@/lib/types'

// ---------------------------------------------------------------------------
// Single onboarding entry point: both intake surfaces survive, both write
// the same profile through the same onComplete pipeline, both read the same
// slot definitions. A part-finished conversation (a saved draft) resumes
// straight into the chat — no chooser detour. Switching to the questionnaire
// ABANDONS the conversation: the draft (queued facts included) is cleared on
// the spot, so nothing from a half-finished chat can ever silently attach to
// a profile the user then builds with the form.
// ---------------------------------------------------------------------------

type Mode = 'choose' | 'chat' | 'form'

export function OnboardingEntry({ onComplete }: { onComplete: (profile: UserProfile) => void }) {
  const [mode, setMode] = useState<Mode>(() => (hasOnboardingDraft() ? 'chat' : 'choose'))

  if (mode === 'form') return <OnboardingFlow onComplete={onComplete} />
  if (mode === 'chat') {
    return (
      <ConversationalOnboarding
        onComplete={onComplete}
        onSwitchToForm={() => {
          clearOnboardingDraft()
          setMode('form')
        }}
      />
    )
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-background">
      <div className="w-full max-w-md space-y-6">
        <div className="flex items-center justify-center gap-2">
          <Dumbbell className="size-6 text-primary" />
          <h1 className="text-xl font-bold tracking-tight">Personal TrAIner</h1>
        </div>
        <div className="text-center space-y-1">
          <h2 className="text-lg font-semibold tracking-tight">How do you want to set up?</h2>
          <p className="text-sm text-muted-foreground">Same questions either way — pick whichever feels right.</p>
        </div>
        <div className="grid grid-cols-1 gap-3">
          <OptionCard
            icon="💬"
            label="Chat with your coach"
            description="Talk it through — type or tap, in any order, and your coach gets the full picture"
            selected={false}
            onClick={() => setMode('chat')}
          />
          <OptionCard
            icon="📋"
            label="Quick questionnaire"
            description="The classic step-by-step form — fastest if you already know your answers"
            selected={false}
            onClick={() => setMode('form')}
          />
        </div>
      </div>
    </div>
  )
}
