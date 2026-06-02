import { StockView } from '@/components/stock-view'
import { requirePageActor } from '@/lib/server/auth'
import { getStockWorkspace } from '@/lib/server/stock'

export default async function StockPage() {
  const actor = await requirePageActor()
  return <StockView actor={actor} initialData={await getStockWorkspace(actor)} />
}
