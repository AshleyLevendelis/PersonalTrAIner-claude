// ---------------------------------------------------------------------------
// THE RAMP-UP SETS LOOK TAPPABLE BEFORE THEY ARE TAPPED.
//
// Ashley reported "theres no way to log the ramp up weights" on 7 Sep 2026.
// The ticks were built to her ruling — a place-keeper, not a log. On 10 Sep
// she reported THE SAME SENTENCE, because an untapped step rendered with the
// identical colour, size and weight as the read-only version: no border, no
// icon, nothing. The affordance only appeared after a tap nobody knew was
// possible, and the "tap one to mark it done" hint lives in a `title`, which a
// phone never shows.
//
// scripts/test-ramp-up-visibility.ts §4 holds the source rules. This holds the
// half no source check can: what the thing actually looks like, computed, on a
// real mount at phone width.
//
// TODAY IS PINNED TO A DAY THAT HOLDS A RAMPED LIFT, because the anchor's own
// today does not and the ramp is tickable on today's session only. WHICH day
// that is, the page tells us — it is not guessed here. See below.
// ---------------------------------------------------------------------------
import { createServer } from 'http'
import { readFileSync, existsSync, writeFileSync } from 'fs'
import { join, extname } from 'path'
import { spawn } from 'child_process'

const DIST='/home/user/PersonalTrAIner-claude/.tour-harness/dist/'
const T={'.html':'text/html','.js':'text/javascript','.css':'text/css'}
const server=createServer((q,r)=>{const p=q.url.split('?')[0];const f=join(DIST,p==='/'?'/.tour-harness/real.html':p);if(!existsSync(f)){r.writeHead(404);r.end('nf');return}r.writeHead(200,{'Content-Type':T[extname(f)]??'application/octet-stream'});r.end(readFileSync(f))})
await new Promise(r=>server.listen(0,r)); const port=server.address().port
const chrome=spawn('/opt/pw-browsers/chromium',['--headless=new','--remote-debugging-port=9405','--no-sandbox','--disable-gpu','about:blank'],{stdio:'ignore'})
const wait=ms=>new Promise(r=>setTimeout(r,ms)); let t
for(let i=0;i<80;i++){try{const l=await fetch('http://127.0.0.1:9405/json/list').then(r=>r.json());const g=l.find(x=>x.type==='page');if(g){t=g.webSocketDebuggerUrl;break}}catch{} await wait(250)}
const ws=new WebSocket(t); await new Promise(r=>ws.addEventListener('open',r,{once:true}))
let id=0;const pend=new Map()
ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id)}})
const send=(m,p={})=>new Promise(r=>{const i=++id;pend.set(i,r);ws.send(JSON.stringify({id:i,method:m,params:p}))})
const ev=async x=>(await send('Runtime.evaluate',{expression:x,returnByValue:true,awaitPromise:true})).result?.result?.value
await send('Page.enable');await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true})
// ASK THE PAGE WHICH DAY, DON'T ASSERT IT. This used to hard-code "the anchor's
// Monday" and then grep for "Barbell Bench Press", which is the mechanism, not
// the property. The property is "a day whose session holds a ramped main lift",
// and real.tsx computes it with formatRampSets — the screen's OWN predicate —
// so the driver and the screen cannot disagree about what counts as ramped.
await send('Page.navigate',{url:`http://127.0.0.1:${port}/?tour=off#/tab/exercise`})
await wait(3000)
const target = await ev(`window.__rampTarget`)
let failures = 0
const check = (name, ok, detail) => {
  if (ok) console.log(`    \u2713 ${name}`)
  else { failures++; console.error(`    \u2717 ${name}${detail !== undefined ? ` \u2014 ${JSON.stringify(detail).slice(0,300)}` : ''}`) }
}
// A null target means the fixture plan has no ramped lift on any day. That is a
// finding about the app, not a reason to skip — fail loudly and stop.
check('0. the fixture plan holds a ramped main lift somewhere', !!target && !!target.date && !!target.exercise, target)
if (!target) { console.error('\nNo ramped lift in the fixture plan — nothing to check.\n'); ws.close(); chrome.kill(); server.close(); process.exit(1) }
console.log(`pinning today to ${target.day} ${target.date}, expanding ${target.exercise}`)
await send('Page.navigate',{url:`http://127.0.0.1:${port}/?tour=off&today=${target.date}#/tab/exercise`})
await wait(4000)
// expand the main lift so its ramp shows
const NAME = JSON.stringify(target.exercise)
await ev(`(()=>{const n=[...document.querySelectorAll('*')].find(x=>x.children.length===0&&x.textContent.trim()===${NAME});
 if(!n) return false; let p=n; for(let i=0;i<6&&p.parentElement;i++){p=p.parentElement; if(p.tagName==='BUTTON'||p.getAttribute('role')==='button'){p.click();return true}} return false})()`)
await wait(1500)
console.log('\nTHE RAMP READS AS SOMETHING YOU CAN TAP\n')
check('1. a ramp block is on screen', await ev(`/Ramp/i.test(document.body.innerText)`) === true)
const info = await ev(`(() => {
  const btns=[...document.querySelectorAll('button')].filter(b=>/warm-up/i.test(b.getAttribute('aria-label')||''))
  if(!btns.length) return {found:0}
  const cs=getComputedStyle(btns[0])
  const r=btns[0].getBoundingClientRect()
  return {found:btns.length, label:btns[0].getAttribute('aria-label'),
    border:cs.borderColor, borderWidth:cs.borderWidth, bg:cs.backgroundColor,
    hasIcon: btns[0].querySelector('svg')!==null, w:Math.round(r.width), h:Math.round(r.height)}
})()`)
check('2. its steps are real buttons, one per warm-up set', info.found >= 3, info)
check('3. an UNTAPPED step is drawn as a control — it has a border', info.borderWidth === '1px' && !/rgba\(0, 0, 0, 0\)/.test(info.border || ''), info)
check('4. ...a background of its own, so it is not bare text', !/rgba\(0, 0, 0, 0\)/.test(info.bg || ''), info.bg)
check('5. ...and an icon before it is tapped, not only after', info.hasIcon === true, info)
check('6. ...at a tappable size', info.h >= 20 && info.w >= 40, info)
await ev(`(()=>{const n=[...document.querySelectorAll('button')].find(b=>/warm-up/i.test(b.getAttribute('aria-label')||'')); if(n) n.scrollIntoView({block:'center'})})()`)
await wait(600)
const s1=await send('Page.captureScreenshot',{format:'png'})
writeFileSync('/home/user/PersonalTrAIner-claude/.tour-harness/ramp-affordance.png', Buffer.from(s1.result.data,'base64'))
// tap the first one and re-shoot
await ev(`(()=>{const n=[...document.querySelectorAll('button')].find(b=>/warm-up/i.test(b.getAttribute('aria-label')||'')); if(n) n.click(); return !!n})()`)
await wait(900)
const after = await ev(`(()=>{const n=[...document.querySelectorAll('button')].find(b=>/warm-up/i.test(b.getAttribute('aria-label')||'')); return n? n.getAttribute('aria-label'):null})()`)
check('7. tapping one marks it done, and offers to unmark', /done .* tap to unmark/i.test(after || ''), after)
const s2=await send('Page.captureScreenshot',{format:'png'})
writeFileSync('/home/user/PersonalTrAIner-claude/.tour-harness/ramp-affordance-tapped.png', Buffer.from(s2.result.data,'base64'))
console.log(failures === 0 ? '\nThe ramp looks tappable before it is tapped.\n' : `\n${failures} check(s) FAILED.\n`)
ws.close();chrome.kill();server.close()
process.exit(failures === 0 ? 0 : 1)
