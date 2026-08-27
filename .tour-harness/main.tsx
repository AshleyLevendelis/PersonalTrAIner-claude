// Drives the REAL AppTour against stub targets. No Supabase, no profile —
// the tour only needs a profileId string, the hash router, and elements
// carrying the data-tour keys.
import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { AppTour } from '@/components/AppTour'
import { BottomDockHeightProvider } from '@/hooks/useBottomDockHeight'
import { BottomTabBar } from '@/components/BottomTabBar'
import { useAppRoute, tabHash, isTab, type Tab } from '@/lib/app-route'
import '@/index.css'

function Harness() {
  const { route } = useAppRoute()
  const tab: Tab = route.kind === 'tab' ? route.tab : 'dashboard'
  const [saved, setSaved] = useState(false)
  return (
    <BottomDockHeightProvider>
      <div className="min-h-screen bg-background text-foreground">
        <div data-tour="settings" className="fixed right-3 top-2 z-40">gear</div>
        <main className="max-w-6xl mx-auto px-4 pt-12 pb-28 space-y-6">
          {tab === 'dashboard' && (<>
            <div data-tour="hero" style={{height:180,background:'var(--surface-raised)'}}>hero</div>
            <div data-tour="tiles" style={{height:160,background:'var(--surface-raised)'}}>tiles</div>
          </>)}
          {tab === 'nutrition' && (<>
            <div data-tour="rings" style={{height:220,background:'var(--surface-raised)'}}>rings</div>
            <div data-tour="meals" style={{height:200,background:'var(--surface-raised)'}}>meals</div>
          </>)}
          {tab === 'exercise' && (<>
            <div data-tour="extoday" style={{height:120,background:'var(--surface-raised)'}}>extoday</div>
            <button id="setbtn" data-tour={saved ? undefined : 'setrow'}
              onClick={() => setSaved(true)}
              style={{height:40,width:40,background:'var(--primary)'}}>OK</button>
            <div style={{height:900}} />
          </>)}
          {tab === 'tools' && <div data-tour="toolsall" style={{height:300,background:'var(--surface-raised)'}}>tools</div>}
          {tab === 'chat' && <div style={{height:300}}>chat</div>}
        </main>
        <BottomTabBar activeTab={tab} onTabChange={t => { if (isTab(t)) window.location.hash = tabHash(t) }} />
        <AppTour profileId="harness-profile" armed />
      </div>
    </BottomDockHeightProvider>
  )
}
createRoot(document.getElementById('root')!).render(<StrictMode><Harness /></StrictMode>)
