// ---------------------------------------------------------------------------
// THE GOOGLE PLAY LISTING'S PICTURES (20 Nov 2026, his "Lets get it on the play store first").
//
//   npx vite build --config .tour-harness/vite.config.ts && node scripts/make-store-assets.cjs
//
// Writes docs/store/play/:
//   icon-512.png             the store icon: 512 square, full bleed (Play rounds it itself), the app's own coach bubble.
//   feature-graphic.png      1024 x 500, opaque (Play refuses see-through): the mark, the name and one line.
//   screenshot-1..5.png      1080 x 1920 phone screenshots of the real screens, drawn by the browser test pages from
//                            the app's own code (the plan is the test pages' made-up "Sam", never a real person).
// Re-run after a screen changes so the listing shows the app as it is.
// ---------------------------------------------------------------------------
const { chromium } = require('playwright')
const http = require('http'), fs = require('fs'), path = require('path')

const ROOT = path.join(__dirname, '..')
const OUT = path.join(ROOT, 'docs/store/play')
const DIST = path.join(ROOT, '.tour-harness/dist')
fs.mkdirSync(OUT, { recursive: true })
if (!fs.existsSync(DIST)) { console.error('Build the test pages first: npx vite build --config .tour-harness/vite.config.ts'); process.exit(1) }

const ICON = fs.readFileSync(path.join(ROOT, 'assets/icon-only.png')).toString('base64')
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' }
const serve = page => http.createServer((q, r) => {
  const p = q.url.split('?')[0]
  const f = path.join(DIST, p === '/' ? `/.tour-harness/${page}` : p)
  if (!fs.existsSync(f)) { r.writeHead(404); return r.end() }
  r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); r.end(fs.readFileSync(f))
})

// Each screenshot: which test page, which tab to tap to reach the screen. Order is the order the listing shows them.
const SHOTS = [
  ['real.html', '', []],
  ['real.html', '', ['Exercise']],
  ['chat.html', '?seed=store', []],
  ['real.html', '', ['Nutrition']],
  ['real.html', '', ['Tools']],
]

const FEATURE = `<html><body style="margin:0;width:1024px;height:500px;overflow:hidden;font-family:Inter,sans-serif;
  background:linear-gradient(135deg,#2B2163,#120F29);color:#fff;display:flex;align-items:center;gap:48px;padding:0 72px;box-sizing:border-box">
  <img src="data:image/png;base64,${ICON}" style="width:260px;height:260px;border-radius:58px;box-shadow:0 0 120px rgba(93,232,197,.35)">
  <div><div style="font-size:64px;font-weight:800;letter-spacing:-1.5px;line-height:1">Personal Tr<span style="color:#5DE8C5">AI</span>ner</div>
  <div style="font-size:30px;font-weight:500;margin-top:22px;line-height:1.3;color:#D9D4F5">Your training plan, your meals,<br>and a coach that knows both.</div></div>
</body></html>`

;(async () => {
  const b = await chromium.launch()
  // Store icon and feature graphic.
  let pg = await b.newPage({ viewport: { width: 512, height: 512 } })
  await pg.setContent(`<body style="margin:0"><img src="data:image/png;base64,${ICON}" style="width:512px;height:512px;display:block"></body>`)
  await pg.screenshot({ path: path.join(OUT, 'icon-512.png'), clip: { x: 0, y: 0, width: 512, height: 512 } }); await pg.close()
  pg = await b.newPage({ viewport: { width: 1024, height: 500 } })
  await pg.setContent(FEATURE); await pg.waitForTimeout(300)
  await pg.screenshot({ path: path.join(OUT, 'feature-graphic.png'), type: 'png', omitBackground: false }); await pg.close()
  // Screenshots: 360 x 640 at 3x = 1080 x 1920, Play's 9:16.
  for (const [i, [page, query, taps]] of SHOTS.entries()) {
    const srv = serve(page); await new Promise(r => srv.listen(0, r))
    pg = await b.newPage({ viewport: { width: 360, height: 640 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
    await pg.goto(`http://127.0.0.1:${srv.address().port}/${query}`); await pg.waitForTimeout(3500)
    // A new phone opens on the app tour; the listing shows the screens, so the tour is skipped as he would skip it.
    const tour = pg.getByRole('dialog', { name: 'App tour' })
    if (await tour.count()) { await tour.getByText('Skip', { exact: true }).click({ timeout: 5000 }); await pg.waitForTimeout(800) }
    for (const t of taps) { await pg.locator('nav[aria-label="Primary"] button', { hasText: t }).first().click({ timeout: 5000 }); await pg.waitForTimeout(1500) }
    await pg.screenshot({ path: path.join(OUT, `screenshot-${i + 1}.png`) })
    await pg.close(); srv.close()
  }
  await b.close()
  console.log(`Wrote ${2 + SHOTS.length} pictures to docs/store/play/`)
})()
