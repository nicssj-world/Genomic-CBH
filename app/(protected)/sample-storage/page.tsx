import { SampleStorageView } from '@/components/sample-storage-view'
import { getSampleStorage } from '@/lib/server/data'

export default async function SampleStoragePage() {
  return <SampleStorageView initialData={await getSampleStorage()} />
}
