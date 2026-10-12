import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const getFile = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')
const auth = getFile('lib/server/auth.ts')
const data = getFile('lib/server/data.ts')
const taskPage = getFile('app/(protected)/task-lists/page.tsx')
const proxy = getFile('proxy.ts')

describe('request-scoped loading optimizations', () => {
  it('deduplicates page/layout actor lookup without weakening auth checks', () => {
    expect(auth).toContain("import { cache } from 'react'")
    expect(auth).toContain('export const getActor = cache(async ()')
    expect(auth).toContain('await supabase.auth.getUser()')
    expect(auth).toContain(".eq('id', user.id)")
    expect(auth).toContain('!data?.is_active')
    expect(auth).toContain('if (!actor) redirect(\'/login\')')
    expect(auth).toContain("if (actor.role !== 'Admin') throw new HttpError(403")
    expect(proxy).toContain('await supabase.auth.getUser()')
    expect(auth).not.toMatch(/unstable_cache|use cache|revalidateTag/)
  })

  it('loads Task List queue once and reuses it when assembling plate slots', () => {
    expect(taskPage).toContain('const actor = await requirePageActor()')
    expect(taskPage).toContain('await getTaskListsWorkspace()')
    expect(taskPage).not.toContain('await listSamples(')
    expect(taskPage).not.toContain('await getCurrentBatch(')
    expect(data).toContain('export async function getTaskListsWorkspace()')
    expect(data).toContain('const [batchResult, samples] = await Promise.all([')
    expect(data).toContain('listSamples({ limit: 1000 })')
    expect(data).toContain('await mapBatch(batchResult.data as RecordRow, samples)')
    expect(data).toContain('preloadedSamples ?? await listSamples({ limit: 1000 })')
    expect(data).toContain('runIds.has(sample.runId)')
  })

  it('preserves on-demand fresh batch reads for mutation and API routes', () => {
    expect(data).toContain('export async function getCurrentBatch()')
    expect(data).toContain('return data ? mapBatch(data as RecordRow) : null')
    expect(data).toContain('export async function getBatch(batchId: string)')
    expect(data).toContain('return mapBatch(data as RecordRow)')
  })
})
