import { LayoutDashboard, PieChart, Activity, UtensilsCrossed, MessageCircle } from 'lucide-react'
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

const SIDE_TABS: { tab: Tab; label: string; icon: typeof LayoutDashboard }[] = [
  { tab: 'dashboard', label: 'Home', icon: LayoutDashboard },
  { tab: 'nutrition', label: 'Nutrition', icon: PieChart },
  { tab: 'exercise', label: 'Exercise', icon: Activity },
  { tab: 'meals', label: 'Meals', icon: UtensilsCrossed },
]

export function BottomTabBar({
  activeTab,
  onTabChange,
}: {
  activeTab: Tab
  onTabChange: (tab: string) => void
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
            onClick={() => onTabChange('chat')}
            aria-label="Chat"
            aria-current={activeTab === 'chat' ? 'page' : undefined}
            className={`-mt-6 flex size-14 shrink-0 items-center justify-center rounded-full text-primary-foreground transition-shadow glow-mint-box ${
              activeTab === 'chat' ? 'ring-2 ring-primary/40 ring-offset-2 ring-offset-[color:var(--surface-deep)]' : ''
            }`}
            style={{ background: 'linear-gradient(180deg, color-mix(in oklab, var(--primary) 84%, white), var(--primary-2))' }}
          >
            <MessageCircle className="size-6" />
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
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`flex flex-1 flex-col items-center justify-center gap-0.5 ${
        active ? 'text-primary glow-mint' : 'text-muted-foreground'
      }`}
    >
      <Icon className={`size-5 ${active ? 'glow-icon' : ''}`} />
      <span className="text-[10px] font-medium">{label}</span>
    </button>
  )
}
