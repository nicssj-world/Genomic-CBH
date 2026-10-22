import { z } from 'zod'
import { buildRegistryLnWorkbook } from '@/lib/nipt/registry-xlsx'
import { requireActor } from '@/lib/server/auth'
import { listRegistryLnPairs } from '@/lib/server/data'
import { jsonError } from '@/lib/server/errors'
import { readJson } from '@/lib/server/route'

export const runtime = 'nodejs'

const schema = z.object({ search: z.string().max(80).optional() })

export async function POST(request: Request) {
  try {
    await requireActor()
    const { search } = await readJson(request, schema)
    const workbook = buildRegistryLnWorkbook(await listRegistryLnPairs(search))
    return new Response(new Uint8Array(workbook), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="genomic-cbh-ln-mapping.xlsx"',
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (error) {
    return jsonError(error)
  }
}
