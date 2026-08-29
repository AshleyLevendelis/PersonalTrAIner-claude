// ---------------------------------------------------------------------------
// Manual tone probe for the conversational onboarding — NOT a gate, and
// deliberately not in package.json: it calls the deployed onboarding-chat
// against the real Gemini API, so it costs money and its output is prose a
// human has to read rather than a pass/fail.
//
// Run it with `npx tsx scripts/probe-onboarding-tone.mts` after changing the
// system prompt, or with a persona:
//
//   npx tsx scripts/probe-onboarding-tone.mts persona.json [transcript.json]
//
// where persona.json is {"name": "...", "messages": ["...", ...]}. It walks
// the scripted user through a full onboarding and prints, per turn, what the
// coach actually SAID and which tools it called; with a transcript path it
// also writes the full structured exchange for offline analysis.
//
// This is what caught the defect the prompt alone could never show: the model
// was returning tool calls with zero text on every turn, so the "conversation"
// the user saw was entirely the client's fallback printing slot questions.
//
// It approximates the client: chip taps and the numeric card are simulated as
// typed text, and set_slot values are validated with the same slot defs the
// client uses. It creates no profile and writes nothing to any database.
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

// Gemini flash on TEST rate-limits under parallel probes — retry, don't die.
async function callWithRetry(body: string): Promise<any> {
  const waits = [2000, 5000, 12000, 25000]
  for (let attempt = 0; ; attempt++) {
    try {
      const r = await fetch(`${URL}/functions/v1/onboarding-chat`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
        body,
      })
      if (r.ok) return await r.json()
      if (attempt >= waits.length) return { reply: '', actions: [], _error: `HTTP ${r.status}` }
    } catch (e: any) {
      if (attempt >= waits.length) return { reply: '', actions: [], _error: e?.message ?? 'network' }
    }
    await new Promise(res => setTimeout(res, waits[attempt]))
  }
}

const history:any[]=[]
const transcript:any[]=[]
async function say(text:string){
  const j:any = await callWithRetry(JSON.stringify({message:text,history,state:state()}))
  history.push({role:'user',content:text})
  if(j.reply) history.push({role:'assistant',content:j.reply})
  const before=new Set(confirmed)
  for(const a of (j.actions||[])){
    if(a.name!=='set_slot') continue
    const key=a.args?.slot_key; const def=ONBOARDING_SLOTS.find((s:any)=>s.key===key); if(!def) continue
    const raw=String(a.args?.value??'')
    // Mirrors ConversationalOnboarding.tsx's coerceSlotValue EXACTLY — this
    // diverged once already (missing the none/no/nothing -> [] case the real
    // client has) and produced a false "dietaryPreferences silently dropped"
    // finding in a verification re-run: the real app handles that skip
    // correctly, only this probe's own simplified copy didn't.
    const trimmedRaw = raw.trim()
    const c:any = def.control==='multi' ? (trimmedRaw===''||/^(none|no|nothing)$/i.test(trimmedRaw)?[]:trimmedRaw.split(',').map(s=>s.trim()).filter(Boolean))
          : (key==='knowsWorkingLifts'||key==='includeSnacks') ? raw.trim()==='true'
          : key==='mealsPerDay' ? Number(raw) : raw.trim()
    if(def.validate(c)){ values[key]=c; confirmed.add(key) }
  }
  console.log('\nUSER:  '+text)
  console.log('COACH: '+(j.reply||'*** NO TEXT ***'))
  const acts=(j.actions||[]).map((a:any)=>a.name+'('+(a.args?.slot_key??'')+(a.args?.value!==undefined?'='+a.args.value:'')+')')
  if(acts.length) console.log('       ['+acts.join(' ')+']')
  transcript.push({
    user: text,
    reply: j.reply ?? '',
    error: j._error,
    actions: j.actions ?? [],
    newlyConfirmed: [...confirmed].filter(k=>!before.has(k)),
    remainingAfter: state().remaining,
  })
}

const personaPath = process.argv[2]
const outPath = process.argv[3]
let personaName = 'default'
let script = ["Ash","Fat Loss","Advanced","Not sure","Sun, Fri, Thu, Mon, Wed"]
if (personaPath) {
  const p = JSON.parse(fs.readFileSync(personaPath, 'utf8'))
  personaName = p.name ?? personaPath
  script = p.messages
}
for(const s of script) await say(s)
const requiredMissing = ONBOARDING_SLOTS
  .filter((d:any)=>d.required&&(!d.requiredIf||d.requiredIf(values)))
  .filter((d:any)=>!confirmed.has(d.key)).map((d:any)=>d.key)
console.log('\n--- answered: '+[...confirmed].join(', '))
console.log('--- required still missing: '+(requiredMissing.join(', ')||'none'))
// The reliability number the reply guarantee is measured by — counted
// separately from transport failures so an unreachable function is never
// misread as model silence.
const emptyTurns = transcript.filter(t=>!t.error&&!String(t.reply??'').trim()).length
const errorTurns = transcript.filter(t=>t.error).length
console.log(`--- empty-reply turns: ${emptyTurns}/${transcript.length}`)
// THE QUESTIONNAIRE NUMBER. Ashley: "a real coach wouldn't be sending you
// buttons to click." Chips are now a rescue (present_slot's description names
// the three cases), so this should be LOW and each one should correspond to a
// turn where the user was genuinely stuck or ambiguous — not simply to every
// question that happens to have a fixed set of answers. Before the change it
// was effectively one per closed-set question, because a forced second model
// call stapled chips onto any question that lacked them.
const chipTurns = transcript.filter(t=>(t.actions??[]).some((a:any)=>a.name==='present_slot'))
console.log(`--- turns that offered chips: ${chipTurns.length}/${transcript.length}`)
if (chipTurns.length) console.log('    on: '+chipTurns.map((t:any)=>(t.actions??[]).filter((a:any)=>a.name==='present_slot').map((a:any)=>a.args?.slot_key).join('/')).join(', '))
if (errorTurns) console.log(`--- transport-error turns (not counted as empty): ${errorTurns}/${transcript.length}`)
if (outPath) {
  fs.writeFileSync(outPath, JSON.stringify({
    persona: personaName,
    turns: transcript,
    final: { values, confirmed: [...confirmed], requiredMissing },
  }, null, 2))
  console.log('--- transcript written: '+outPath)
}
