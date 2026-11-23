import type { CapacitorConfig } from '@capacitor/cli'

// The phone app (20 Nov 2026): the same web app, built by `npm run build`, shipped inside a native shell so it can
// read steps from Apple Health and Health Connect. See docs/plans/phone-app.md.
//
// appId is his choice of 23 Nov 2026, the reverse of personaltrainerapp.co.uk, which he owns. PERMANENT after the first
// store upload: Apple and Google tie the listing to it.
const config: CapacitorConfig = {
  appId: 'uk.co.personaltrainerapp',
  appName: 'Personal TrAIner',
  webDir: 'dist',
}

export default config
