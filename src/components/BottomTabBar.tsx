import { LayoutDashboard, PieChart, Activity, Wrench, MessageCircle } from 'lucide-react'
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

const SIDE_TABS: { tab: Tab; label: string; icon: typeof LayoutDashboard }[] = [
  { tab: 'dashboard', label: 'Home', icon: LayoutDashboard },
  { tab: 'nutrition', label: 'Nutrition', icon: PieChart },
  { tab: 'exercise', label: 'Exercise', icon: Activity },
  { tab: 'tools', label: 'Tools', icon: Wrench },
]

export function BottomTabBar({
  activeTab,
  onTabChange,
  chatAttention = false,
}: {
  activeTab: Tab
  onTabChange: (tab: string) => void
  /**
   * The coach has something that wants an answer — an unreviewed session, a
   * missed day (coach-opener.ts, `attention`). Draws one small dot on the
   * chat button and nothing else: no count, no pulse, no colour change on
   * the button itself. It is a nudge, not a demand, and it goes away the
   * moment the chat is opened, whether or not they answer.
   *
   * Deliberately NOT lit for "today is a training day" — that is every other
   * day, and a dot that is always on is a dot nobody sees.
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
            aria-label={chatAttention ? 'Chat — the coach has something for you' : 'Chat'}
            aria-current={activeTab === 'chat' ? 'page' : undefined}
            className={`relative -mt-6 flex size-14 shrink-0 items-center justify-center rounded-full text-primary-foreground transition-shadow glow-mint-box ${
              activeTab === 'chat' ? 'ring-2 ring-primary/40 ring-offset-2 ring-offset-[color:var(--surface-deep)]' : ''
            }`}
            style={{ background: 'linear-gradient(180deg, color-mix(in oklab, var(--primary) 84%, white), var(--primary-2))' }}
          >
            <MessageCircle className="size-6" />
            {chatAttention && (
              <span
                data-testid="chat-attention-dot"
                aria-hidden="true"
                className="absolute -right-0.5 -top-0.5 size-3 rounded-full bg-[color:var(--background)] p-[2px]"
              >
                <span className="block size-full rounded-full bg-amber-400" />
              </span>
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
  icon: typeof LayoutDashboard
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
        active ? 'text-primary glow-mint' : 'text-muted-foreground'
      }`}
    >
      <Icon className={`size-5 ${active ? 'glow-icon' : ''}`} />
      <span className="text-[0.625rem] font-medium">{label}</span>
    </button>
  )
}
