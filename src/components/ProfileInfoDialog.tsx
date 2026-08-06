import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { getActivityLabel, getGoalLabel } from '@/lib/calculations'
import type { UserProfile } from '@/lib/types'

// ---------------------------------------------------------------------------
// The "Your Profile" card, relocated from NutritionDisplay.tsx — reference
// data (age/height/goal/etc.), not a nutrition number and not a daily
// action, so it lives behind the profile/settings menu (ProfileMenu.tsx)
// rather than adding scroll weight to Dashboard's daily-action flow.
// Same Dialog-wrapped, fully-controlled pattern as MemoryScreen.tsx.
// ---------------------------------------------------------------------------

interface ProfileInfoDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  profile: UserProfile
  latestWeightKg?: number | null
}

export function ProfileInfoDialog({ open, onOpenChange, profile, latestWeightKg }: ProfileInfoDialogProps) {
  const effectiveWeightKg = latestWeightKg != null && latestWeightKg > 0 ? latestWeightKg : profile.weight_kg

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Your Profile</DialogTitle>
        </DialogHeader>
        <div className="text-sm space-y-2">
          <div className="flex justify-between"><span className="text-muted-foreground">Age</span><span>{profile.age} years</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Gender</span><span className="capitalize">{profile.gender}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Height</span><span>{profile.height_cm} cm</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Weight</span><span>{effectiveWeightKg} kg{latestWeightKg != null && latestWeightKg > 0 ? '' : ' (onboarding)'}</span></div>
          <div className="flex justify-between items-center"><span className="text-muted-foreground">Activity</span><span className="text-right text-xs max-w-[180px]">{getActivityLabel(profile.activity_level)}</span></div>
          <div className="flex justify-between items-center"><span className="text-muted-foreground">Goal</span><Badge variant="secondary">{getGoalLabel(profile.fitness_goal)}</Badge></div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
