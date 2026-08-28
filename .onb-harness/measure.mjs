import { createServer } from 'http'
import { readFileSync, existsSync, readdirSync, statSync, writeFileSync } from 'fs'
import { join, extname } from 'path'
import { spawn } from 'child_process'
const DIST = new URL('./dist/', import.meta.url).pathname
// NAMED, not "the first .html found by walking dist". That is what this was,
// and the moment a second entry (composer.html) joined the same bundle it
// sorted first and this driver began serving THE WRONG PAGE — reporting
// "screens that overflow: none" against a document with no [data-q] in it at
// all. The empty-rows guard below is the other half of that fix.
const HTML = join(DIST, '.onb-harness/onb.html')
const T={'.html':'text/html','.js':'text/javascript','.css':'text/css'}
const server=createServer((q,r)=>{const p=q.url.split('?')[0]; const f=p==='/'?HTML:join(DIST,p)
  if(!existsSync(f)){r.writeHead(404);r.end();return} r.writeHead(200,{'Content-Type':T[extname(f)]??'application/octet-stream'}); r.end(readFileSync(f))})
await new Promise(r=>server.listen(0,r)); const port=server.address().port
const chrome=spawn('/opt/pw-browsers/chromium',['--headless=new','--remote-debugging-port=9340','--no-sandbox','--disable-gpu','about:blank'],{stdio:'ignore'})
const wait=ms=>new Promise(r=>setTimeout(r,ms)); let t
for(let i=0;i<60;i++){try{const l=await fetch('http://127.0.0.1:9340/json/list').then(r=>r.json());const g=l.find(x=>x.type==='page');if(g){t=g.webSocketDebuggerUrl;break}}catch{} await wait(250)}
const ws=new WebSocket(t); await new Promise(r=>ws.addEventListener('open',r,{once:true}))
let id=0; const pend=new Map(); ws.addEventListener('message',e=>{const m=JSON.parse(e.data); if(m.id&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id)}})
const send=(m,p={})=>new Promise(r=>{const i=++id;pend.set(i,r);ws.send(JSON.stringify({id:i,method:m,params:p}))})
const ev=x=>send('Runtime.evaluate',{expression:x,returnByValue:true,awaitPromise:true}).then(r=>r.result?.result?.value)
await send('Page.enable'); await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true})
await send('Page.navigate',{url:`http://127.0.0.1:${port}/`}); await wait(1800)
const measured = await ev(`(() => {
  const vh = 844
  const rows = []
  document.querySelectorAll('[data-q]').forEach(el => {
    const h = Math.round(el.getBoundingClientRect().height)
    rows.push({ k: el.dataset.q, h })
  })
  const over = rows.filter(r => r.h > vh - 180)   // 180px for composer + safe area
  return 'viewport ' + vh + 'px, composer leaves ~' + (vh - 180) + 'px\\n' +
    rows.map(r => '  ' + r.k.padEnd(24) + String(r.h).padStart(4) + 'px' + (r.h > vh - 180 ? '   OVERFLOWS' : '')).join('\\n') +
    '\\n  screens that overflow: ' + (over.length ? over.map(o=>o.k).join(', ') : 'none') +
    (rows.length === 0 ? '\\n  MEASURED NOTHING — no [data-q] on the page' : '')
})()`)
console.log(measured)
const r = await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true})
writeFileSync(new URL('./chips-compare.png', import.meta.url).pathname, Buffer.from(r.result.data,'base64'))
console.log('\n  wrote chips-compare.png')
if (!measured || /MEASURED NOTHING/.test(measured)) {
  console.error('\n  the harness rendered no questions — nothing above is a measurement\n')
  chrome.kill(); server.close(); process.exit(1)
}
chrome.kill(); server.close()
