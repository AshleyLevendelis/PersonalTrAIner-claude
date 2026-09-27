import { ChartSpline, Utensils, Dumbbell, Wrench, MessageCircle } from 'lucide-react'
import { useViewportInset } from '@/hooks/useViewportInset'
import type { Tab } from '@/lib/app-route'

// ---------------------------------------------------------------------------
// Primary navigation, moved from the top TabsList to a fixed bottom bar —
// the standard mobile pattern, with Chat raised as the centre action. Drives
// the exact same activeTab/onTabChange App.tsx already threads into the top
// Tabs component; this is a second UI for that one piece of state, not a
// second routing mechanism.
//
// Hides entirely while the keyboard is open (a focused set-input row has no
// use for navigation, and freeing the space keeps BottomDock's collapsed
// thin-line state from having to share the floor with anything). BottomDock
// sits directly above this bar when the keyboard is closed — see
// TAB_BAR_HEIGHT_PX, which BottomDock.tsx imports to compute its own offset.
// ---------------------------------------------------------------------------

export const TAB_BAR_HEIGHT_PX = 64

/**
 * `data-tour` keys for the app tour's nav stops (AppTour.tsx). Derived from
 * the tab rather than passed in per call site: the tour needs to spotlight
 * the REAL tab button so the user's own tap does the navigating, and a key
 * that is computed here cannot be forgotten when a tab is added.
 */
const TOUR_KEY: Record<Tab, string> = {
  dashboard: 'navHome',
  nutrition: 'navNutrition',
  exercise: 'navExercise',
  tools: 'navTools',
  chat: 'chatfab',
}

// THE ICONS SAY WHAT IS BEHIND THEM (27 Sep 2026, with the grocery revamp):
// a trend line for Home's progress, a knife and fork for food, a dumbbell for
// training. The old dashboard grid, pie chart and pulse line were generic.
const SIDE_TABS: { tab: Tab; label: string; icon: typeof ChartSpline }[] = [
  { tab: 'dashboard', label: 'Home', icon: ChartSpline },
  { tab: 'nutrition', label: 'Nutrition', icon: Utensils },
  { tab: 'exercise', label: 'Exercise', icon: Dumbbell },
  { tab: 'tools', label: 'Tools', icon: Wrench },
]

export function BottomTabBar({
  activeTab,
  onTabChange,
  chatAttention = false,
  flatChatDisc = false,
}: {
  activeTab: Tab
  onTabChange: (tab: string) => void
  /**
   * Lay the chat button flat inside the bar (44px) instead of raising it 24px
   * proud. Raised, it stands in the middle of anything docked on the bar — the
   * chat's composer (design 2a) and the grocery add bar (design 3a) — so App
   * sets this on exactly those two screens.
   */
  flatChatDisc?: boolean
  /**
   * The coach has something that wants an answer — an unreviewed session or a
   * missed day (coach-opener.ts, `attention`), or a reply the trainee has not
   * read yet (chat-unread.ts). Draws a ring outside the disc, a pulse on the
   * disc's own halo, and the small dot. Still no count and no colour change:
   * it is a nudge, not a demand, and it goes away the moment the chat is
   * opened, whether or not they answer.
   *
   * The ring and the pulse REPLACE "one small dot and nothing else", which
   * was a deliberate decision recorded here until 6 Sep 2026. Ashley asked
   * for them by name after not finding them on her phone; the app-polish
   * handoff had specified them and deferred the keyframes to a chat handoff
   * that never arrived.
   *
   * THE DOT IS NOW A FALLBACK, NOT A COMPANION (7 Sep 2026). Ashley, seeing
   * both at once: "we no longer need the orange dot because the glowing outer
   * ring now does that job." It does — except at glow Off, where the ring and
   * the pulse are both scaled to nothing by --glow-strength and something has
   * to be left saying the coach has something. So the dot is hidden by CSS
   * wherever the ring is visible and shown only under [data-glow="off"]; see
   * .chat-attention-dot in index.css. One indicator at a time, in every
   * setting.
   *
   * Deliberately NOT lit for "today is a training day" — that is every other
   * day, and a signal that is always on is a signal nobody sees. The same
   * rule is why the client-composed opener does not count as unread.
   */
  chatAttention?: boolean
}) {
  const { isKeyboardOpen } = useViewportInset()
  if (isKeyboardOpen) return null

  // Chat sits in visual centre position (3rd of 5) despite being last in
  // SIDE_TABS-plus-chat ordering — split the four flanking tabs 2/2 around it.
  const [leftTabs, rightTabs] = [SIDE_TABS.slice(0, 2), SIDE_TABS.slice(2)]

  return (
    // Borderless: the top hairline is replaced by a fade from transparent into
    // --surface-deep, so the bar separates from the canvas by fill alone (3a/3b).
    <nav
      className="fixed inset-x-0 bottom-0 z-40 bg-[color:var(--surface-deep)]"
      style={{
        paddingBottom: 'env(safe-area-inset-bottom)',
        backgroundImage: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, var(--surface-deep) 45%)',
      }}
      aria-label="Primary"
    >
      <div className="mx-auto flex max-w-6xl items-stretch" style={{ height: TAB_BAR_HEIGHT_PX }}>
        {leftTabs.map(t => (
          <SideTabButton key={t.tab} {...t} active={activeTab === t.tab} onClick={() => onTabChange(t.tab)} />
        ))}

        <div className="flex flex-1 items-center justify-center">
          <button
            type="button"
            data-tour={TOUR_KEY.chat}
            onClick={() => onTabChange('chat')}
            aria-label={chatAttention ? 'Chat — your Personal TrAIner has something for you' : 'Chat'}
            aria-current={activeTab === 'chat' ? 'page' : undefined}
            // The active-tab ring and the attention ring never co-occur:
            // App suppresses chatAttention while the chat is the open tab.
            // FLUSH WHERE SOMETHING IS DOCKED ON THE BAR (design 2a, 26 Sep;
            // design 3a, 27 Sep). Raised, the 56px disc stands 24px proud of
            // the bar — straight into the middle of a composer or add bar
            // sitting directly on it. Everywhere else it stays raised.
            className={`relative flex shrink-0 items-center justify-center rounded-full text-primary-foreground transition-shadow glow-mint-box ${
              flatChatDisc ? 'mt-0 size-11' : '-mt-6 size-14'
            } ${
              chatAttention ? 'chat-unread' : ''
            } ${
              activeTab === 'chat' ? 'ring-2 ring-primary/40 ring-offset-2 ring-offset-[color:var(--surface-deep)]' : ''
            }`}
            style={{ background: 'linear-gradient(180deg, color-mix(in oklab, var(--primary) 84%, white), var(--primary-2))' }}
          >
            <MessageCircle className={flatChatDisc ? 'size-5' : 'size-6'} />
            {chatAttention && (
              <>
                <span data-testid="chat-unread-ring" aria-hidden="true" className="chat-unread-ring" />
                <span
                  data-testid="chat-attention-dot"
                  aria-hidden="true"
                  className="chat-attention-dot absolute -right-0.5 -top-0.5 size-3 rounded-full bg-[color:var(--background)] p-[2px]"
                >
                  <span className="block size-full rounded-full bg-amber-400" />
                </span>
              </>
            )}
          </button>
        </div>

        {rightTabs.map(t => (
          <SideTabButton key={t.tab} {...t} active={activeTab === t.tab} onClick={() => onTabChange(t.tab)} />
        ))}
      </div>
    </nav>
  )
}

function SideTabButton({
  tab,
  label,
  icon: Icon,
  active,
  onClick,
}: {
  tab: Tab
  label: string
  icon: typeof ChartSpline
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      data-tour={TOUR_KEY[tab]}
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`flex flex-1 flex-col items-center justify-center gap-0.5 ${
        active ? 'text-primary-text glow-mint' : 'text-muted-foreground'
      }`}
    >
      <Icon className={`size-5 ${active ? 'glow-icon' : ''}`} />
      <span className="text-[0.625rem] font-medium">{label}</span>
    </button>
  )
}
