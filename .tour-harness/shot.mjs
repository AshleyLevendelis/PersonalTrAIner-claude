import { createServer } from 'http'
import { readFileSync, existsSync, readdirSync, statSync, writeFileSync } from 'fs'
import { join, extname } from 'path'
import { spawn } from 'child_process'
const DIST = new URL('./dist/', import.meta.url).pathname
const HTML = (function f(d){for(const e of readdirSync(d)){const p=join(d,e); if(statSync(p).isDirectory()){const h=f(p); if(h)return h} else if(e.endsWith('.html'))return p} return null})(DIST)
const T={'.html':'text/html','.js':'text/javascript','.css':'text/css'}
const server=createServer((q,r)=>{const p=q.url.split('?')[0]; const f=p==='/'?HTML:join(DIST,p)
  if(!existsSync(f)){r.writeHead(404);r.end();return} r.writeHead(200,{'Content-Type':T[extname(f)]??'application/octet-stream'}); r.end(readFileSync(f))})
await new Promise(r=>server.listen(0,r)); const port=server.address().port
const chrome=spawn('/opt/pw-browsers/chromium',['--headless=new','--remote-debugging-port=9336','--no-sandbox','--disable-gpu','about:blank'],{stdio:'ignore'})
const wait=ms=>new Promise(r=>setTimeout(r,ms)); let t
for(let i=0;i<60;i++){try{const l=await fetch('http://127.0.0.1:9336/json/list').then(r=>r.json());const g=l.find(x=>x.type==='page');if(g){t=g.webSocketDebuggerUrl;break}}catch{} await wait(250)}
const ws=new WebSocket(t); await new Promise(r=>ws.addEventListener('open',r,{once:true}))
let id=0; const pend=new Map(); ws.addEventListener('message',e=>{const m=JSON.parse(e.data); if(m.id&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id)}})
const send=(m,p={})=>new Promise(r=>{const i=++id;pend.set(i,r);ws.send(JSON.stringify({id:i,method:m,params:p}))})
const ev=x=>send('Runtime.evaluate',{expression:x,returnByValue:true,awaitPromise:true}).then(r=>r.result?.result?.value)
await send('Page.enable'); await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true})
await send('Page.navigate',{url:`http://127.0.0.1:${port}/#/tab/dashboard`}); await wait(1800)
const shot = async name => {
  const r = await send('Page.captureScreenshot',{format:'png'})
  writeFileSync(new URL(`./${name}.png`, import.meta.url).pathname, Buffer.from(r.result.data,'base64'))
  console.log('  wrote', name + '.png')
}
await shot('tour-1-welcome')
await ev(`(()=>{const c=document.querySelector('.tour-fade');[...c.querySelectorAll('button')].pop().click()})()`); await wait(700)
await shot('tour-2-hero')
await ev(`(()=>{const c=document.querySelector('.tour-fade');[...c.querySelectorAll('button')].pop().click()})()`); await wait(600)
await ev(`(()=>{const c=document.querySelector('.tour-fade');[...c.querySelectorAll('button')].pop().click()})()`); await wait(800)
await shot('tour-4-tap-nutrition')
chrome.kill(); server.close()
