// node do.mjs <cmd> [arg] [arg2] — sends one command to serve.mjs (exploratory QA, 8 Oct 2026).
const [cmd, arg, arg2] = process.argv.slice(2)
const r = await fetch('http://127.0.0.1:8762', { method: 'POST', body: JSON.stringify({ cmd, arg, arg2 }) })
const t = await r.text()
try { const v = JSON.parse(t); console.log(typeof v === 'string' ? v : JSON.stringify(v, null, 1)) } catch { console.log(t) }
