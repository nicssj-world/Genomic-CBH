import { formatBangkokIsoDate } from './rules'

/** Most recent manual registration for each Bangkok intake day.
 * Exact-time ties are resolved deterministically by sample UUID.
 * An operational UI helper, independent of HIS received_date and LN Halos.
 */
export function latestSampleIdsByBangkokDay(
  samples: ReadonlyArray<{ id: string; importedAt: string }>,
): Set<string> {
  const daily = new Map<string, { id: string; at: number }>()
  for (const sample of samples) {
    const at = Date.parse(sample.importedAt)
    if (!Number.isFinite(at)) continue
    const day = formatBangkokIsoDate(new Date(at))
    const old = daily.get(day)
    if (!old || at > old.at || (at === old.at && sample.id > old.id)) {
      daily.set(day, { id: sample.id, at })
    }
  }
  return new Set([...daily.values()].map((value) => value.id))
}
