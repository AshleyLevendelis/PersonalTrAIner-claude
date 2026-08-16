// ---------------------------------------------------------------------------
// Manual tone probe for the conversational onboarding — NOT a gate, and
// deliberately not in package.json: it calls the deployed onboarding-chat
// against the real Gemini API, so it costs money and its output is prose a
// human has to read rather than a pass/fail.
//
// Run it with `npx tsx scripts/probe-onboarding-tone.mts` after changing the
// system prompt. It walks a scripted user through a full onboarding and
// prints, per turn, what the coach actually SAID and which tools it called.
// This is what caught the defect the prompt alone could never show: the model
// was returning tool calls with zero text on every turn, so the "conversation"
// the user saw was entirely the client's fallback printing slot questions.
// ---------------------------------------------------------------------------

import fs from 'fs'
fs.readFileSync('.env.local','utf8').split('\n').forEach(l=>{const i=l.indexOf('=');if(i>0)process.env[l.slice(0,i).trim()]=l.slice(i+1).trim()})
const URL=process.env.VITE_SUPABASE_URL!, KEY=process.env.VITE_SUPABASE_ANON_KEY!
const m = await import('../src/lib/onboarding-slots')
const { ONBOARDING_SLOTS, buildSlotCatalog, initialSlotValues } = m as any

const values: any = initialSlotValues()
const confirmed = new Set<string>()
const displayOf=(def:any)=>{ const v=values[def.key]; if(v===null||v===undefined||v==='')return '—'
  if(Array.isArray(v)) return v.length?v.map((x:any)=>def.options?.find((o:any)=>String(o.value)===String(x))?.label??x).join(', '):'none'
  return def.options?.find((o:any)=>String(o.value)===String(v))?.label ?? String(v) }
const state=()=>{ const filled:any={}; for(const d of ONBOARDING_SLOTS) if(confirmed.has(d.key)) filled[d.key]=displayOf(d)
  const remaining=ONBOARDING_SLOTS.filter((d:any)=>!confirmed.has(d.key)&&(!d.requiredIf||d.requiredIf(values))).map((d:any)=>d.key)
  return { slotCatalog: buildSlotCatalog(values), filled, remaining } }

const history:any[]=[]
async function say(text:string){
  const r=await fetch(`${URL}/functions/v1/onboarding-chat`,{method:'POST',
    headers:{Authorization:`Bearer ${KEY}`,'Content-Type':'application/json'},
    body:JSON.stringify({message:text,history,state:state()})})
  const j:any=await r.json()
  history.push({role:'user',content:text})
  if(j.reply) history.push({role:'assistant',content:j.reply})
  for(const a of (j.actions||[])){
    if(a.name!=='set_slot') continue
    const key=a.args?.slot_key; const def=ONBOARDING_SLOTS.find((s:any)=>s.key===key); if(!def) continue
    const raw=String(a.args?.value??'')
    const c:any = def.control==='multi' ? (raw.trim()===''?[]:raw.split(',').map(s=>s.trim()).filter(Boolean))
          : (key==='knowsWorkingLifts'||key==='includeSnacks') ? raw.trim()==='true'
          : key==='mealsPerDay' ? Number(raw) : raw.trim()
    if(def.validate(c)){ values[key]=c; confirmed.add(key) }
  }
  console.log('\nUSER:  '+text)
  console.log('COACH: '+(j.reply||'*** NO TEXT ***'))
  const acts=(j.actions||[]).map((a:any)=>a.name+'('+(a.args?.slot_key??'')+(a.args?.value!==undefined?'='+a.args.value:'')+')')
  if(acts.length) console.log('       ['+acts.join(' ')+']')
}
const script=["Hi, I'm Ash","fat loss mainly","I've never really trained, tried a gym once years ago and hated it","Mon Wed Fri work best","sleep's alright, work's not physical","not keen on cardio to be honest","30-45 mins","mornings","just my bodyweight at home","functional I guess","my left knee clicks sometimes","no restrictions","3 meals, and yeah snacks","quick stuff, nothing fancy","marmite, can't stand it"]
for(const s of script) await say(s)
console.log('\n--- answered: '+[...confirmed].join(', '))
