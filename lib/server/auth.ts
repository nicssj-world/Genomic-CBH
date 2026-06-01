import 'server-only'

import { redirect } from 'next/navigation'
import type { Actor } from '@/lib/nipt/types'
import { getAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { HttpError } from '@/lib/server/errors'

export async function getActor(): Promise<Actor | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data, error } = await getAdminClient()
    .from('nipt_users')
    .select('id,ephis_id,display_name,role,is_active')
    .eq('id', user.id)
    .maybeSingle()

  if (error || !data?.is_active) return null
  return {
    id: data.id,
    ephisId: data.ephis_id,
    displayName: data.display_name,
    role: data.role,
  }
}

export async function requireActor() {
  const actor = await getActor()
  if (!actor) throw new HttpError(401, 'Unauthorized')
  return actor
}

export async function requireAdmin() {
  const actor = await requireActor()
  if (actor.role !== 'Admin') throw new HttpError(403, 'Admin permission required')
  return actor
}

export async function requirePageActor() {
  const actor = await getActor()
  if (!actor) redirect('/login')
  return actor
}

export async function requireAdminPageActor() {
  const actor = await requirePageActor()
  if (actor.role !== 'Admin') redirect('/dashboard')
  return actor
}
