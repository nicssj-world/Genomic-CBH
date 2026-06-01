import { TaskListsView } from '@/components/task-lists-view'
import { requirePageActor } from '@/lib/server/auth'
import { getCurrentBatch, listSamples } from '@/lib/server/data'

export default async function TaskListsPage() {
  return <TaskListsView actor={await requirePageActor()} initialBatch={await getCurrentBatch()} initialSamples={await listSamples({ limit: 1000 })} />
}
