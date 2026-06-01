import { PatientsView } from '@/components/patients-view'
import { requirePageActor } from '@/lib/server/auth'
import { listSamples } from '@/lib/server/data'

export default async function PatientsPage({ searchParams }: { searchParams: Promise<{ sample?: string }> }) {
  return <PatientsView actor={await requirePageActor()} initialSamples={await listSamples()} initialSelectedId={(await searchParams).sample} />
}
