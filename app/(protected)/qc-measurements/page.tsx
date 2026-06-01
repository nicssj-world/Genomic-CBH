import { QcMeasurementsView } from '@/components/qc-measurements-view'
import { requirePageActor } from '@/lib/server/auth'
import { getQcWorkspace } from '@/lib/server/data'

export default async function QcMeasurementsPage() {
  await requirePageActor()
  return <QcMeasurementsView initialWorkspace={await getQcWorkspace()} />
}
