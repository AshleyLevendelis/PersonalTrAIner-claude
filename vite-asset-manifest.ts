import type { Plugin } from 'vite'

// ---------------------------------------------------------------------------
// THE LIST OF EVERYTHING THE BUILD MADE, so the service worker can save all of it to the phone.
//
// Ashley, 10 Nov 2026: "gyms often don't have WiFi ... we should be able to do as much as possible in the app
// without network". The app's screens are split into files that used to reach the phone only when first opened
// (public/sw.js cached on fetch), so a sheet never opened at home did not exist in the gym. sw.js's own header
// said why it had no list: Vite names files by their contents, so a hand-written list is wrong by the next build.
// This is the build plugin that header said would be needed: the list is written BY the build, from the build.
//
// Code and styles only. Not index.html (the worker keeps the shell itself, network-first) and not the manifest.
// ---------------------------------------------------------------------------
export const ASSET_MANIFEST_FILE = 'asset-manifest.json'

export function assetManifest(): Plugin {
  return {
    name: 'asset-manifest',
    apply: 'build',
    generateBundle(_options, bundle) {
      const files = Object.keys(bundle)
        .filter(name => /\.(js|css)$/.test(name))
        .map(name => `/${name}`)
        .sort()
      this.emitFile({ type: 'asset', fileName: ASSET_MANIFEST_FILE, source: JSON.stringify({ files }) })
    },
  }
}
