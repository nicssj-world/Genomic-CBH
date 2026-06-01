import { HisImportsView } from '@/components/his-imports-view'
import { requirePageActor } from '@/lib/server/auth'
import { listHisImports } from '@/lib/server/data'

export default async function HisImportsPage() {
  await requirePageActor()
  return <HisImportsView initialImports={await listHisImports()} />
}
