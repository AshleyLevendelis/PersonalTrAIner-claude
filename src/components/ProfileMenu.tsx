import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Settings, RotateCcw, UserCircle } from 'lucide-react'

// ---------------------------------------------------------------------------
// Houses the housekeeping actions ("Profile", "New Plan") the header used to
// carry as always-visible buttons. Now that navigation lives in the bottom
// tab bar, the header is a thin per-screen strip — these move behind one
// icon so they don't compete with it. Profile is the single "what this app
// knows about me" surface (Memory merged in) — same handlers as before
// (setProfileInfoOpen/handleReset in App.tsx), only the entry point moved.
// ---------------------------------------------------------------------------

export function ProfileMenu({
  onOpenProfile,
  onNewPlan,
}: {
  onOpenProfile: () => void
  onNewPlan: () => void
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
        <DropdownMenuItem onClick={onNewPlan}>
          <RotateCcw className="size-3.5" />
          New Plan
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
