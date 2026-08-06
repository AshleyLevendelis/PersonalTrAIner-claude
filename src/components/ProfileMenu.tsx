import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Settings, BrainCircuit, RotateCcw, UserCircle } from 'lucide-react'

// ---------------------------------------------------------------------------
// Houses the housekeeping actions ("Memory", "New Plan", "Profile") the
// header used to carry as always-visible buttons (or, for Profile, that
// NutritionDisplay used to render inline). Now that navigation lives in the
// bottom tab bar, the header is a thin per-screen strip — these move behind
// one icon so they don't compete with it. Same handlers as before
// (setMemoryScreenOpen/handleReset/setProfileInfoOpen in App.tsx), only the
// entry point moved.
// ---------------------------------------------------------------------------

export function ProfileMenu({
  onOpenMemory,
  onNewPlan,
  onOpenProfile,
}: {
  onOpenMemory: () => void
  onNewPlan: () => void
  onOpenProfile: () => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Profile and settings">
          <Settings className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onOpenProfile}>
          <UserCircle className="size-3.5" />
          Profile
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onOpenMemory}>
          <BrainCircuit className="size-3.5" />
          Memory
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onNewPlan}>
          <RotateCcw className="size-3.5" />
          New Plan
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
