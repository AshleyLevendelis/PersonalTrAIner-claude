import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Settings, BrainCircuit, RotateCcw } from 'lucide-react'

// ---------------------------------------------------------------------------
// Houses the two housekeeping actions ("Memory", "New Plan") the header used
// to carry as always-visible buttons. Now that navigation lives in the
// bottom tab bar, the header is a thin per-screen strip — these move behind
// one icon so they don't compete with it. Same handlers as before
// (setMemoryScreenOpen/handleReset in App.tsx), only the entry point moved.
// ---------------------------------------------------------------------------

export function ProfileMenu({
  onOpenMemory,
  onNewPlan,
}: {
  onOpenMemory: () => void
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
