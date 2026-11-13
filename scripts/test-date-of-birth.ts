// ---------------------------------------------------------------------------
// test:date-of-birth — Ashley, 9 Nov 2026, option 1: "keep the birthday so the age goes up on its own".
//
// The date of birth picked in setup or on Profile is kept beside the age; the app works out today's age from it when
// it opens. Held here, the parts no screen shows:
//   1. The age to use today: from the date of birth when there is one (it goes up on the birthday), else as recorded.
//   2. Setup: the answer is kept, put on the profile, and checked to the same 13-100 limit as the age.
//   3. Before the database change is run: a Profile save keeps the age and lets the birthday wait; any other failure
//      is still a failure. (A fake database that refuses the column, and records what it was asked.)
//   4. Wiring (source): the app's start sets the age from the date of birth; the setup save names it and tries once
//      more without it when the database has not got it; and the database change adds it.
// The screens are driven in verify:composer (setup keeps it, never says it back) and verify:profile-fixes §9.
// Every check runs every time.
// ---------------------------------------------------------------------------
import { readFileSync, readdirSync } from 'fs'

let failures = 0
let ran = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  ran++
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.log(`  FAIL: ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ''}`) }
}
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

async function main() {
  const { currentAge, todayLocal } = await import('../src/lib/body-units')
  const slots = await import('../src/lib/onboarding-slots')

  console.log('\n1. The age to use today')
  check('from the date of birth: 33 the day before the birthday', currentAge('1990-06-15', 30, '2024-06-14') === 33)
  check('...and 34 on it, whatever age was recorded', currentAge('1990-06-15', 30, '2024-06-15') === 34)
  check('no date of birth: the age as recorded', currentAge(null, 41, '2024-06-15') === 41 && currentAge(undefined, 41) === 41 && currentAge('', 41) === 41)
  check('neither: no age (never an invented one)', currentAge(null, null) === undefined && currentAge(undefined, undefined) === undefined)
  check('a date of birth that is not a real date: the age as recorded, not a guess', currentAge('1990-02-30', 35, '2024-06-15') === 35)
  check('today is the phone\'s own calendar date', todayLocal(new Date(2026, 10, 9, 23, 30)) === '2026-11-09' && todayLocal(new Date(2026, 0, 1, 0, 5)) === '2026-01-01',
    [todayLocal(new Date(2026, 10, 9, 23, 30)), todayLocal(new Date(2026, 0, 1, 0, 5))])

  console.log('\n2. Setup keeps it')
  const def = slots.getSlotDef('dateOfBirth')
  check('setup has a place for the date of birth, never asked on its own', !!def && def.destination === 'column' && slots.ONBOARDING_SLOTS.some(s => s.key === 'dateOfBirth'))
  const young = `${new Date().getFullYear() - 10}-01-01`
  check('it holds the age\'s own limits: 13 to 100, no future date, blank allowed',
    !!def && def.validate('1990-06-15') && !def.validate(young) && !def.validate('2999-01-01') && !def.validate('1900-01-01') && !def.validate('soon') && def.validate(''))
  const base = { ...slots.initialSlotValues(), fitnessGoal: 'fat_loss', equipment: 'full_gym', trainingDays: ['Mon', 'Wed', 'Fri'], age: '36' } as never
  const withDob = slots.assembleProfile({ ...(base as object), dateOfBirth: '1990-06-15' } as never) as { date_of_birth?: string; age?: number }
  const without = slots.assembleProfile(base) as { date_of_birth?: string }
  check('a picked date goes on the profile beside the age', withDob.date_of_birth === '1990-06-15' && withDob.age === 36, { dob: withDob.date_of_birth, age: withDob.age })
  check('...and an age typed instead leaves it absent, never blank', without.date_of_birth === undefined, without.date_of_birth)

  console.log('\n3. A Profile save before the database change is run')
  const { setSupabaseClient } = await import('../src/lib/supabase')
  const { updateProfileField } = await import('../src/lib/profile-store')
  let asked: Record<string, unknown>[] = []
  let refuse: 'birthday' | 'other' | null = 'birthday'
  const fake = {
    from: () => ({
      update: (patch: Record<string, unknown>) => ({
        eq: async () => {
          asked.push(patch)
          if (refuse === 'birthday' && 'date_of_birth' in patch) return { error: { code: 'PGRST204', message: "Could not find the 'date_of_birth' column of 'fitness_profiles' in the schema cache" } }
          if (refuse === 'other') return { error: { code: '42501', message: 'permission denied' } }
          return { error: null }
        },
      }),
    }),
  }
  setSupabaseClient(fake as never)
  // Caught, not left to throw: a save that fails here is a FAILED check, never a crash that skips the rest.
  let firstThrew = false
  try { await updateProfileField('p1', { date_of_birth: '1990-06-15', age: 36 } as never) } catch { firstThrew = true }
  check('the age still saves, and the birthday waits for the database change', !firstThrew && asked.length === 2 && 'date_of_birth' in asked[0] && !('date_of_birth' in asked[1]) && asked[1].age === 36, asked)
  asked = []
  let threw = false
  refuse = 'other'
  try { await updateProfileField('p1', { date_of_birth: '1990-06-15', age: 36 } as never) } catch { threw = true }
  check('any other refusal is still a failure, said, and not retried', threw && asked.length === 1, { threw, asked })
  asked = []
  refuse = null
  await updateProfileField('p1', { date_of_birth: '1990-06-15', age: 36 } as never)
  check('once the database has the column, one save carries both', asked.length === 1 && asked[0].date_of_birth === '1990-06-15', asked)

  console.log('\n4. Wiring')
  const app = strip(readFileSync('src/App.tsx', 'utf8'))
  check('the app\'s start sets the age from the date of birth', /age: currentAge\(profileRow\.date_of_birth, profileRow\.age\)/.test(app) && /date_of_birth: profileRow\.date_of_birth/.test(app))
  const insert = app.slice(app.indexOf('const profileInsert = {'), app.indexOf('const profileInsert = {') + 6000)
  check('the setup save names it', /date_of_birth: enrichedProfile\.date_of_birth \?\? null,/.test(insert))
  check('...and tries once more without it when the database has not got it',
    // RE-ANCHORED 13 Nov 2026 on the property: the column is on the pending list, and a missing-column error for it
    // drops just that column from the payload and inserts again (one loop for every pending column since slice 3).
    /PENDING_COLUMNS = \[[^\]]*'date_of_birth'/.test(insert)
      && /isMissingColumnError\(insertError, c\)/.test(insert)
      && /const \{ \[column\]: _notYet, \.\.\.without \} = pending[\s\S]{0,120}\.insert\(pending\)/.test(insert))
  const migration = readdirSync('supabase/migrations').filter(f => /date_of_birth/.test(f)).map(f => readFileSync(`supabase/migrations/${f}`, 'utf8')).join('\n')
  check('the database change adds the column, as a date, nullable', /ADD COLUMN IF NOT EXISTS date_of_birth date NULL/.test(migration), migration.slice(0, 200))

  console.log(`\n${ran} checks ran`)
  if (failures > 0) { console.log(`${failures} FAILED`); process.exit(1) }
  console.log('The birthday is kept, and the age goes up on its own.')
}
main().catch(e => { console.error(e); process.exit(1) })
