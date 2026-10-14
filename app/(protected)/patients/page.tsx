import { PatientsView } from '@/components/patients-view'
import { requirePageActor } from '@/lib/server/auth'
import { getSample, listRegistrySamples } from '@/lib/server/data'

export default async function PatientsPage({ searchParams }: { searchParams: Promise<{ sample?: string }> }) {
  const actor = await requirePageActor()
  const { sample } = await searchParams
  const initialPage = await listRegistrySamples()
  // Dashboard links may refer to records outside the first 50 on the registry.
  const initialSelectedSample = sample && !initialPage.samples.some((row) => row.id === sample)
    ? await getSample(sample)
    : null
  return <PatientsView actor={actor} initialPage={initialPage} initialSelectedId={sample} initialSelectedSample={initialSelectedSample} />
}
