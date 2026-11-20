import type { CapacitorConfig } from '@capacitor/cli'

// The phone app (20 Nov 2026): the same web app, built by `npm run build`, shipped inside a native shell so it can
// read steps from Apple Health and Health Connect. See docs/plans/phone-app.md.
//
// appId IS A PLACEHOLDER UNTIL THE FIRST STORE UPLOAD, and permanent after it: Apple and Google tie the listing to it.
// Change it before that upload if Ashley wants a different one (reverse of a domain he owns is the convention).
const config: CapacitorConfig = {
  appId: 'app.personaltrainer.coach',
  appName: 'Personal TrAIner',
  webDir: 'dist',
}

export default config
