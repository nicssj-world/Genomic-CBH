import { createClient } from '@supabase/supabase-js'

function argument(name) {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? process.argv[index + 1] : undefined
}

function required(value, message) {
  if (!value) throw new Error(message)
  return value
}

const envHint = 'Configure .env.local before running this command.'
const url = required(process.env.NEXT_PUBLIC_NIPT_SUPABASE_URL, `Missing NEXT_PUBLIC_NIPT_SUPABASE_URL. ${envHint}`)
const serviceRoleKey = required(process.env.NIPT_SUPABASE_SERVICE_ROLE_KEY, `Missing NIPT_SUPABASE_SERVICE_ROLE_KEY. ${envHint}`)
const ephisId = required(argument('ephis'), 'Use --ephis <employee-code>')
const displayName = required(argument('name'), 'Use --name "<display name>"')
const password = required(argument('password'), 'Use --password "<initial password>"')

if (!/^\d+$/.test(ephisId)) throw new Error('E-Phis must contain digits only')
if (password.length < 8) throw new Error('Password must contain at least 8 characters')

const admin = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })
const { data, error } = await admin.auth.admin.createUser({
  email: `${ephisId}@nipt.cbh.go.th`,
  password,
  email_confirm: true,
})
if (error) throw error

const userId = data.user.id
const { error: profileError } = await admin.from('nipt_users').insert({
  id: userId,
  ephis_id: ephisId,
  display_name: displayName,
  role: 'Admin',
})
if (profileError) {
  await admin.auth.admin.deleteUser(userId)
  throw profileError
}

console.log(`Created NIPT Admin ${displayName} (${ephisId})`)
