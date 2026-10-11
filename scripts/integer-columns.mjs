// Integer columns per table, read from the migrations (CREATE TABLE bodies and ALTER TABLE ... ADD COLUMN).
import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'
export function integerColumns(root) {
  const dir = join(root, 'supabase/migrations')
  const out = {}
  const INT = /^(integer|int|int4|smallint|int2|bigint|int8)$/i
  const add = (t, c) => { (out[t] ??= new Set()).add(c) }
  const drop = (t, c) => { out[t]?.delete(c) }
  for (const f of readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) {
    const sql = readFileSync(join(dir, f), 'utf8').replace(/--.*$/gm, '')
    for (const m of sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?(\w+)"?\s*\(([\s\S]*?)\n\)\s*;/gi)) {
      for (const line of m[2].split('\n')) {
        const c = /^\s*"?(\w+)"?\s+(\w+(?:\s*\[\])?)/.exec(line)
        if (c && INT.test(c[2]) && !/^(constraint|primary|unique|check|foreign)$/i.test(c[1])) add(m[1], c[1])
      }
    }
    for (const m of sql.matchAll(/alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?(?:public\.)?"?(\w+)"?([\s\S]*?);/gi)) {
      for (const c of m[2].matchAll(/add\s+column\s+(?:if\s+not\s+exists\s+)?"?(\w+)"?\s+(\w+(?:\s*\[\])?)/gi)) if (INT.test(c[2])) add(m[1], c[1]); else drop(m[1], c[1])
      for (const c of m[2].matchAll(/alter\s+column\s+"?(\w+)"?\s+(?:set\s+data\s+)?type\s+(\w+(?:\s*\[\])?)/gi)) if (INT.test(c[2])) add(m[1], c[1]); else drop(m[1], c[1])
      for (const c of m[2].matchAll(/drop\s+column\s+(?:if\s+exists\s+)?"?(\w+)"?/gi)) drop(m[1], c[1])
    }
  }
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v.size).sort().map(([t, v]) => [t, [...v].sort()]))
}

