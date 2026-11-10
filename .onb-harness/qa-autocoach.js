// Injected after the harness's own fetch hook: answers every onboarding-chat request by asking the first remaining slot.
(() => {
  const w = window
  w.__auto = { log: [], on: true, extra: null }
  const prior = w.fetch
  w.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input.url
    if (!url.includes('/functions/v1/onboarding-chat') || !w.__auto.on) return prior(input, init)
    const body = JSON.parse(String(init?.body ?? '{}'))
    w.__auto.log.push(body)
    if (w.__auto.extra) { const e = w.__auto.extra; w.__auto.extra = null; return new Response(JSON.stringify(e), { status: 200, headers: { 'Content-Type': 'application/json' } }) }
    let rem = body.state?.remaining ?? []
    const cat = body.state?.slotCatalog
    let reply, actions = []
    const pre = []
    if (w.__auto.lastText && rem.includes(w.__auto.lastText)) {
      pre.push({ name: 'set_slot', args: { slot_key: w.__auto.lastText, value: body.message } })
      rem = rem.filter(k => k !== w.__auto.lastText)
    }
    w.__auto.lastText = null
    if (rem.length === 0) { reply = 'That is everything.'; actions = [{ name: 'complete_onboarding', args: {} }] }
    else {
      const k = rem[0]
      let q = null
      if (Array.isArray(cat)) q = cat.find(c => c.key === k)?.question
      else if (cat && typeof cat === 'object') q = cat[k]?.question
      if (!q && typeof cat === 'string') { const m = cat.split('\n').find(l => l.includes(k)); q = m }
      reply = `Thanks. ${q ?? ('Question for ' + k)}`
      actions = [{ name: 'present_slot', args: { slot_key: k } }]
      const c = Array.isArray(cat) ? cat.find(x => x.key === k) : null
      if (c?.control === 'text') w.__auto.lastText = k
    }
    actions = [...pre, ...actions]
    return new Response(JSON.stringify({ reply, actions }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }
})()
