import { createClient } from '@supabase/supabase-js'

function argument(name) {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? process.argv[index + 1] : undefined
}

const url = process.env.NEXT_PUBLIC_NIPT_SUPABASE_URL
const serviceRoleKey = process.env.NIPT_SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceRoleKey) throw new Error('Missing env vars. Run with --env-file-if-exists=.env.local')

const ephisId = argument('ephis')
const newPassword = argument('password')
if (!ephisId) throw new Error('Use --ephis <employee-code>')
if (!newPassword || newPassword.length < 8) throw new Error('Use --password "<new password>" (min 8 chars)')

const admin = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })

// Find user by email
const { data: listData, error: listError } = await admin.auth.admin.listUsers()
if (listError) throw listError

const email = `${ephisId}@nipt.cbh.go.th`
const user = listData.users.find(u => u.email === email)
if (!user) {
  console.error(`User ${email} not found in Supabase auth.`)
  console.log('Run bootstrap:admin to recreate:')
  console.log(`  npm run bootstrap:admin -- --ephis ${ephisId} --name "<ชื่อ>" --password "${newPassword}"`)
  process.exit(1)
}

const { error } = await admin.auth.admin.updateUserById(user.id, { password: newPassword })
if (error) throw error

console.log(`Reset password for ${email} (id: ${user.id})`)
