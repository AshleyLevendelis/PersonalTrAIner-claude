const { chromium } = require('playwright')
// The dumbbell from public/icon-512.png, redrawn as vector so it is sharp at 1024 and 2732.
const bell = (scale) => `
<g transform="translate(512 512) rotate(20) scale(${scale})">
  <rect x="-250" y="-20" width="500" height="40" rx="6" fill="#5DE8C5"/>
  <rect x="-330" y="-120" width="110" height="240" rx="34" fill="#5DE8C5"/>
  <rect x="220" y="-120" width="110" height="240" rx="34" fill="#5DE8C5"/>
</g>`
const svg = (body, size, bg) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${bg ? `<rect width="${size}" height="${size}" fill="${bg}"/>` : ''}${body}</svg>`
const files = {
  'icon-only.png': [1024, svg(bell(1), 1024, '#1A1636')],
  // Android adaptive icons crop to a circle or squircle inside the middle ~66%, so the foreground is smaller.
  'icon-foreground.png': [1024, svg(bell(0.66), 1024, null)],
  'icon-background.png': [1024, svg('', 1024, '#1A1636')],
  'splash.png': [2732, svg(`<g transform="translate(854 854)">${bell(1.1)}</g>`, 2732, '#1A1636')],
  'splash-dark.png': [2732, svg(`<g transform="translate(854 854)">${bell(1.1)}</g>`, 2732, '#1A1636')],
}
;(async () => {
  const b = await chromium.launch()
  for (const [name, [size, s]] of Object.entries(files)) {
    const p = await b.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 })
    await p.setContent(`<html><body style="margin:0;background:transparent">${s}</body></html>`)
    await p.screenshot({ path: `assets/${name}`, omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } })
    await p.close()
  }
  await b.close()
})()
