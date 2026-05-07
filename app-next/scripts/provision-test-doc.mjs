// One-shot: create a fresh DOC user + empty club so we can immediately
// click "Load Demo Data" without slogging through signup + onboarding.
// Reads env from .env.local. Prints the credentials to stdout — paste
// them into the login form.

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Naive .env.local parser — keeps the script dependency-free.
function loadEnv() {
  const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8')
  for (const line of raw.split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (!m) continue
    const [, key, value] = m
    if (!process.env[key]) process.env[key] = value.replace(/^["']|["']$/g, '')
  }
}

loadEnv()

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const admin = createClient(url, serviceKey)

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
const email = `jozo.cancar27+seedtest-${stamp}@gmail.com`
const password = 'DemoTest!' + Math.random().toString(36).slice(2, 8)
const displayName = 'Demo Test DOC'
const clubName = 'Seed Test FC'

console.log('Creating test DOC...')

const { data: created, error: authErr } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { full_name: displayName, is_test: true },
})
if (authErr || !created.user) throw new Error(`createUser failed: ${authErr?.message}`)

const userId = created.user.id
console.log(`auth.users id: ${userId}`)

// Club first — profile.club_id references it.
const { data: club, error: clubErr } = await admin
  .from('clubs')
  .insert({ name: clubName, created_by: userId })
  .select('id')
  .single()
if (clubErr || !club) throw new Error(`club insert failed: ${clubErr?.message}`)

// Profile — DOC role, onboarding already complete so we land on /dashboard.
const { error: profileErr } = await admin
  .from('profiles')
  .insert({
    user_id: userId,
    club_id: club.id,
    role: 'doc',
    display_name: displayName,
    onboarding_complete: true,
  })
if (profileErr) throw new Error(`profile insert failed: ${profileErr.message}`)

// Empty club passes the demo-seed "emptyEnough" check (≤1 team), so we
// deliberately do NOT create a team here. The seed action will create
// "U14 Boys" itself when you click Load Demo Data.

console.log('\n=== READY TO LOG IN ===')
console.log(`URL:      http://localhost:3000/login`)
console.log(`Email:    ${email}`)
console.log(`Password: ${password}`)
console.log(`Club:     ${clubName} (${club.id})`)
console.log('\nPaste the credentials, hit Sign In, then click "Load Demo Data".')
