import { TaskListsView } from '@/components/task-lists-view'
import { requirePageActor } from '@/lib/server/auth'
import { getTaskListsWorkspace } from '@/lib/server/data'

export default async function TaskListsPage() {
  const actor = await requirePageActor()
  const { batch, samples } = await getTaskListsWorkspace()
  return <TaskListsView actor={actor} initialBatch={batch} initialSamples={samples} />
}
