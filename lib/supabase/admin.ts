import 'server-only'

import { createClient } from '@supabase/supabase-js'
import { requireEnv } from '@/lib/supabase/env'

// Replace this bootstrap type with generated Supabase types after the hosted project is provisioned.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UntypedDatabase = any

function createAdminClient() {
  return createClient<UntypedDatabase>(
    requireEnv('NEXT_PUBLIC_NIPT_SUPABASE_URL'),
    requireEnv('NIPT_SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

let adminClient: ReturnType<typeof createAdminClient> | undefined

export function getAdminClient() {
  adminClient ??= createAdminClient()
  return adminClient
}
