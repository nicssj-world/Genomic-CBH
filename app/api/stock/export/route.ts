import { buildStockBalancesCsv, buildStockMovementsCsv, type StockStatusFilter } from '@/lib/nipt/stock-csv'
import { requireActor } from '@/lib/server/auth'
import { HttpError, jsonError } from '@/lib/server/errors'
import { getStockWorkspace, logStockExport } from '@/lib/server/stock'

const STOCK_STATUSES = new Set<StockStatusFilter>(['all', 'low', 'expiring', 'expired'])

export async function GET(request: Request) {
  try {
    const actor = await requireActor()
    const searchParams = new URL(request.url).searchParams
    const report = searchParams.get('report') ?? 'balances'
    if (!['balances', 'movements'].includes(report)) throw new HttpError(400, 'Unsupported stock report')
    const statusParam = searchParams.get('status') ?? 'all'
    if (!STOCK_STATUSES.has(statusParam as StockStatusFilter)) throw new HttpError(400, 'Unsupported stock status filter')
    const filters = {
      q: searchParams.get('q') ?? undefined,
      categoryId: searchParams.get('categoryId') ?? undefined,
      status: statusParam as StockStatusFilter,
    }
    const stock = await getStockWorkspace(actor)
    const csv = report === 'movements' ? buildStockMovementsCsv(stock, filters) : buildStockBalancesCsv(stock, filters)
    await logStockExport(report, actor)
    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="stock-${report}.csv"`,
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (error) {
    return jsonError(error)
  }
}
