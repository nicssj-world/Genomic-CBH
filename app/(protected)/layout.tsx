import { AppShell } from '@/components/app-shell'
import { requirePageActor } from '@/lib/server/auth'

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  return <AppShell actor={await requirePageActor()}>{children}</AppShell>
}
