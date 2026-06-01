import { redirect } from 'next/navigation'
import { LoginForm } from '@/components/login-form'
import { getActor } from '@/lib/server/auth'

export default async function LoginPage() {
  let actor = null
  try {
    actor = await getActor()
  } catch {
    // Keep the login shell renderable while a fresh deployment is waiting for env provisioning.
  }
  if (actor) redirect('/dashboard')
  return <LoginForm />
}
