import { useEffect, useRef, useState } from 'react'
import { CheckCircle2 } from 'lucide-react'
import type { MesocycleWeek } from '@/lib/types'
import { RECEIPTS_UNDONE } from '@/lib/coach-voice'
import { publishScreenEdit, saveWeekFor, undoScreenEdit, useScreenEdit } from '@/lib/screen-edit-undo'

/** How long the line stays: long enough to read an exercise name or two, short enough not to sit over the session. */
const SCREEN_UNDO_LINE_MS = 8000

/**
 * "Swapped Lat Pulldown for Seated Cable Row. · Undo" (QA walk T7, 8 Nov 2026), above the tab bar after an exercise
 * is swapped, removed, moved or added on the Exercise screen. His "Undo line" shape, the shopping list's bar. Undo
 * puts back only what is still as the change left it (screen-edit-undo.ts), and a refusal says so in the coach
 * card's words.
 */
export function ScreenEditUndoLine({
  mesocycle,
  profileId,
  onMesocycleUpdated,
  onPutBack,
  bottom,
}: {
  mesocycle: MesocycleWeek[] | null | undefined
  profileId: string | null | undefined
  onMesocycleUpdated?: (m: MesocycleWeek[]) => void
  /** Whatever re-reads the week after a put-back (the strip, Home, the coach). */
  onPutBack?: () => void
  bottom: string
}) {
  const record = useScreenEdit()
  const [shownId, setShownId] = useState<number | null>(null)
  const [note, setNote] = useState<{ text: string; undo: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const arm = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => { setNote(null); setShownId(null) }, SCREEN_UNDO_LINE_MS)
  }

  // A NEW change shows its line; the same record re-rendered does not restart it.
  useEffect(() => {
    if (!record || record.id === shownId) return
    setShownId(record.id)
    setNote({ text: record.text, undo: true })
    arm()
  }, [record]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  if (!note) return null

  const runUndo = async () => {
    if (!record || !profileId || !mesocycle || busy) return
    setBusy(true)
    const out = await undoScreenEdit(record, mesocycle, Date.now(), saveWeekFor(profileId))
    setBusy(false)
    if (out.ok) {
      onMesocycleUpdated?.(out.mesocycle)
      publishScreenEdit(null)
      onPutBack?.()
      setNote({ text: RECEIPTS_UNDONE.detail(record.text), undo: false })
    } else {
      setNote({ text: out.refusal, undo: out.keep })
    }
    arm()
  }

  return (
    <div
      role="status"
      data-testid="screen-edit-undo-line"
      className="fixed inset-x-3 z-50 flex min-h-12 items-center gap-2.5 rounded-[14px] bg-secondary py-1.5 pl-3.5 pr-1.5 shadow-[0_10px_30px_rgba(0,0,0,.4)]"
      style={{ bottom }}
    >
      <CheckCircle2 className="size-4 shrink-0 text-primary-text" aria-hidden />
      <span className="min-w-0 flex-1 text-[0.8125rem] leading-snug" data-testid="screen-edit-undo-text">{note.text}</span>
      {note.undo && (
        <button
          type="button"
          data-testid="screen-edit-undo"
          disabled={busy}
          onClick={runUndo}
          className="hit-slop-44 h-9 shrink-0 px-3 text-[0.8125rem] font-semibold text-primary-text disabled:opacity-50"
        >
          Undo
        </button>
      )}
    </div>
  )
}
