import { DashboardView } from '@/components/dashboard-view'
import { requirePageActor } from '@/lib/server/auth'
import { getDashboard } from '@/lib/server/data'

export default async function DashboardPage() {
  const actor = await requirePageActor()
  return <DashboardView initialData={await getDashboard(actor)} />
}
