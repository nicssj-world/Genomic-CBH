'use client'

import { createBrowserClient } from '@supabase/ssr'

let browserClient: ReturnType<typeof createBrowserClient> | undefined

export function createClient() {
  browserClient ??= createBrowserClient(
    process.env.NEXT_PUBLIC_NIPT_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_NIPT_SUPABASE_ANON_KEY!,
    { cookieOptions: { name: 'nipt-auth' } },
  )
  return browserClient
}
