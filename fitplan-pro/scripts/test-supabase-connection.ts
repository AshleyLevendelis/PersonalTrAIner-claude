import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'

// Load .env.local manually
const envPath = path.join(process.cwd(), '.env.local')
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8')
  envContent.split('\n').forEach(line => {
    if (line.trim() && !line.startsWith('#')) {
      const [key, value] = line.split('=')
      if (key && value) {
        process.env[key.trim()] = value.trim()
      }
    }
  })
}

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ ERROR: Missing Supabase credentials in .env.local')
  console.error('  VITE_SUPABASE_URL:', supabaseUrl ? '✓ set' : '✗ missing')
  console.error('  VITE_SUPABASE_ANON_KEY:', supabaseKey ? '✓ set' : '✗ missing')
  process.exit(1)
}

console.log('Testing Supabase Connection...')
console.log('')

const supabase = createClient(supabaseUrl, supabaseKey)

async function testConnection() {
  try {
    // Test 1: Connect to Supabase
    console.log('1️⃣  Connecting to Supabase...')
    console.log(`   URL: ${supabaseUrl}`)
    
    // Test 2: Query fitness_profiles table
    console.log('2️⃣  Querying fitness_profiles table...')
    const { data: profiles, error: profileError } = await supabase
      .from('fitness_profiles')
      .select('id')
      .limit(1)
    
    if (profileError) {
      console.error('   ❌ Error querying profiles:', profileError.message)
      return false
    }
    console.log('   ✅ fitness_profiles table accessible')
    console.log(`   Records: ${profiles?.length || 0}`)
    
    // Test 3: Query chat_messages table
    console.log('3️⃣  Querying chat_messages table...')
    const { data: messages, error: messageError } = await supabase
      .from('chat_messages')
      .select('id')
      .limit(1)
    
    if (messageError) {
      console.error('   ❌ Error querying messages:', messageError.message)
      return false
    }
    console.log('   ✅ chat_messages table accessible')
    console.log(`   Records: ${messages?.length || 0}`)
    
    // Test 4: Query exercise_plans table
    console.log('4️⃣  Querying exercise_plans table...')
    const { data: exercises, error: exerciseError } = await supabase
      .from('exercise_plans')
      .select('id')
      .limit(1)
    
    if (exerciseError) {
      console.error('   ❌ Error querying exercises:', exerciseError.message)
      return false
    }
    console.log('   ✅ exercise_plans table accessible')
    console.log(`   Records: ${exercises?.length || 0}`)
    
    // Test 5: Query meal_plans table
    console.log('5️⃣  Querying meal_plans table...')
    const { data: meals, error: mealError } = await supabase
      .from('meal_plans')
      .select('id')
      .limit(1)
    
    if (mealError) {
      console.error('   ❌ Error querying meals:', mealError.message)
      return false
    }
    console.log('   ✅ meal_plans table accessible')
    console.log(`   Records: ${meals?.length || 0}`)
    
    console.log('')
    console.log('================================================================================')
    console.log('✅ ALL SUPABASE CONNECTIONS SUCCESSFUL!')
    console.log('================================================================================')
    console.log('')
    console.log('Database is ready. Next steps:')
    console.log('  1. Run: npm run dev')
    console.log('  2. Open: http://localhost:5173')
    console.log('  3. Test the onboarding flow')
    console.log('')
    
    return true
  } catch (err) {
    console.error('❌ Connection test failed:', err)
    return false
  }
}

testConnection().then(success => {
  process.exit(success ? 0 : 1)
})
