import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function loadEnv() {
  const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8')
  for (const line of raw.split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (!m) continue
    if (!process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}
loadEnv()

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const userId = '23ad4fd5-0bde-4f9c-bed1-e252e30f5dc6'
const newPassword = 'demotest1234'

const { error } = await admin.auth.admin.updateUserById(userId, { password: newPassword })
if (error) throw new Error(error.message)

console.log('Password reset.')
console.log('Email:    jozo.cancar27+seedtest-2026-05-07t19-02-01@gmail.com')
console.log(`Password: ${newPassword}`)
