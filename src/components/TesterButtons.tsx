import type { MouseEvent } from 'react'
import { Bug, Flag } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { useTesterOn } from '@/lib/tester-log'
import type { ReportArea } from '@/components/TesterReport'

// ---------------------------------------------------------------------------
// THE TESTER'S REPORT BUTTONS (tester toolkit, his ruling 25 Nov 2026, "Both"). Drawn only for somebody who agreed to
// test. The sheet itself (TesterReport.tsx) is fetched on the tap, so nobody else ever downloads it.
// ---------------------------------------------------------------------------

/** Opens the report sheet; the picture of the screen is taken first, inside openTesterReport. */
export function openReport(opts: { area?: ReportArea; itemLabel?: string } = {}): void {
  void import('@/components/TesterReport').then(m => m.openTesterReport(opts)).catch(() => {})
}

/** The bug beside the gear, on every screen. */
export function TesterReportButton() {
  const on = useTesterOn()
  if (!on) return null
  return (
    <Button variant="ghost" size="icon-sm" aria-label="Report a problem" data-tester-report-open data-tester-no-shot onClick={() => openReport()}>
      <Bug className="size-4" />
    </Button>
  )
}

/** "Report a problem" in an exercise's ⋮ menu. */
export function TesterReportMenuItem({ area, itemLabel }: { area: ReportArea; itemLabel: string }) {
  const on = useTesterOn()
  if (!on) return null
  return (
    <DropdownMenuItem onClick={() => openReport({ area, itemLabel })} data-testid="tester-report-item">
      <Bug className="size-3.5" />
      Report a problem
    </DropdownMenuItem>
  )
}

/** A small flag on an item's own sheet (a meal). */
export function TesterReportFlag({ area, itemLabel, className = '' }: { area: ReportArea; itemLabel: string; className?: string }) {
  const on = useTesterOn()
  if (!on) return null
  return (
    <button
      type="button"
      aria-label={`Report a problem with ${itemLabel}`}
      title="Report a problem"
      data-tester-report-flag={area}
      onClick={(e: MouseEvent<HTMLButtonElement>) => { e.stopPropagation(); openReport({ area, itemLabel }) }}
      className={`flex size-11 items-center justify-center text-muted-foreground ${className}`}
    >
      <Flag className="size-[17px]" aria-hidden />
    </button>
  )
}
