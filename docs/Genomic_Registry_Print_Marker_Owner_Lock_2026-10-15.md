# Genomic CBH — Identifier, Auto/Manual Print Marker, and Registry Contract
Owner lock: 2026-10-15. **Temporary Genomic workflow only**, not NIPT-CBH clinical governance. This addendum supplements the preserved source audit: \`docs/GENOMIC_CBH_IDENTIFIER_STATUS_BASELINE_2026-10-15.md\`.

## Identifier namespaces (immutable)
- HIS LN is text, preserve leading zeros. LN Halos BASE is \`YYBYYMMDDNNN\` (Asia/Bangkok; Gregorian date; monthly counter 001–999). Duplicate scans retain BASE; deleted identifiers are retired. Never reset the counter daily.
- Effective BASE for Twin is \`BASED\`. \`runSampleId\`: Normal \`BASE-1\`; Re-Library \`BASE-2\`; Re-Sampling \`BASER\` (with Twin, \`BASED-1\`, \`BASED-2\`, \`BASEDR\`). Run stages \`Received/Extract/Pooling/Sequencing/Completed\` are not identity suffixes.
- Physical 60×20 mm labels: **4 stickers, 8 halves**: \`(BASE, BASE)\`, \`(BASE, BASE)\`, \`(BASE, BASE-1)\`, \`(BASE-2, BASE-3)\`. Printed half codes \`-1/-2/-3\` do **not** assert that an analytical rerun occurred. Every half prints LN Halos above \`LN: <HIS LN>\`. Never add barcode/QR or silently change print geometry.
- Controls: \`YYN1YYYYMMDD\` positive, \`YYN2YYYYMMDD\` negative, \`YYN3YYYYMMDD\` blank; distinct from patient BASE. Batch \`RunNNN/YYYY\`, box \`BoxNNN/YYYY\` are independent labels.
- NIPT-CBH clinical S2+ redraw may get a **new BASE** under the same HIS LN. Genomic \`R\` means a simplified rerun type and must not be copied as NIPT redraw identity.

## New Owner Lock — one global manual marker
The marker means **first specimen to start printing next time**, *not* the last printed specimen. This section describes staff-initiated Manual Mark; automatic behavior is specified below. Any authorized staff can manually mark A then B; one database singleton pointer is replaced under a row lock, so A stops being marked globally. It survives reload/day/another workstation, including when the marked sample is not among the 50 visible rows. Staff can jump to the marker or clear it. Deleting that sample clears its pointer; it does not select another automatically.

Mark does not imply the physical print completed, never follows a browser print dialog, and does not alter specimen stage, LN Halos, run type, task slots, or NIPT clinical state. Atomic marker changes append actor/old/new sample-id audit.

The earlier \`nipt_intake_day_end_markers\` records mean *last received sample per Bangkok day*, with potentially many dates. They are historical data and **are not the one active print marker**. Existing historical records are retained, but competing star/mark actions are removed from Dashboard/Patient Registry to avoid two contradictory meanings.

## Auto Mark and Manual priority — Owner confirmation 2026-10-15

- A database trigger on successful **new sample INSERT** sets the sole global Mark on the **first received/registered specimen of each Asia/Bangkok day**, provided there is no active Manual Mark. Duplicate HIS LN intake returns the original record without triggering another Mark.
- `auto_evaluated_date` is advanced exactly once on the day's first incoming registration, even if a Manual Mark blocks Auto. Later arrivals on the same day **never** move or reset Mark. Existing records from earlier that day are detected; a migration deployed midday does not mistakenly call a later sample the day's first.
- Active `mark_source=MANUAL` takes precedence **across days**; Auto does not override it tomorrow or later. Staff must explicitly clear or change Manual. A staff click on an Auto-marked specimen promotes it to MANUAL, without clearing it; clicking a Manual-marked specimen again clears it.
- If there is no Manual active, the first newly registered sample on the next Bangkok day replaces the preceding day's Auto Mark. Clearing a Mark does not make the second sample of the same day an Auto candidate.
- Mark persists across browsers/devices, always exactly one shared pointer, and its origin appears as **Auto Mark** or **Manual Mark**. Both changes are serialized on the singleton database row and audited with actor, previous/current ID and source.
- New logic is additive in `supabase/migrations/202610150002_genomic_auto_first_intake_mark.sql`. It never modifies LN Halos generation, Rerun identity, patient stages, labels or NIPT-CBH clinical tables, and does not backfill previously received samples.

### Required verification

- A: first intake of an empty Bangkok date gets Auto; B: next intake same date does not change Auto; duplicate A does not change Auto.
- Date rolls over with Auto active → first new intake gets Auto. With Manual active → Auto cannot replace Manual, even after midnight.
- Clicking the currently Auto-marked specimen converts it to Manual and tomorrow's first receipt leaves it intact.
- Clearing Manual or Auto does not immediately select another later sample that day; on next day's first intake Auto resumes.
- Concurrent manual/new intake operations serialize to at most one mark; no LN Halos allocator or physical label changes.
- Physical printer proof still requires operational validation, independent of these software tests.

## Registry and preview behavior
- Registry-only server pagination, **50 records per page**; stable \`imported_at DESC, id DESC\`. Global search for HIS LN, BASE LN Halos, HN and patient name, not only previous first 250 records.
- Checkbox selection is available to Staff/Admin for print, **visible page only**, never silently selecting prior/next pages. Admin-only bulk Delete remains separate with confirmation.
- Shared preview picker shows correct LN Halos AND LN HIS for each sample, rather than displaying patient-name \`—\`. The existing physical label builder is untouched.
- Browser \`print()\` cannot prove physical paper completion. No automatic marker movement; physical printer test still required.

## Operational gates
1. Apply \`supabase/migrations/202610150001_genomic_manual_label_mark.sql\` on **Genomic-CBH Supabase only**, after checking migration history. Migration is additive (new table + RPC; no changes to LN tables).
2. Verify Mark A→B from two sessions/pages, delete marked sample, refresh, clear, and display the marked record across search and page changes.
3. Verify global search, 50-row boundaries, selected-count correctness and no cross-page selection. Verify 4 label stickers per sample for one/15/50 items and label geometry on actual printer.
4. Verify historic monthly allocator, duplicate handling, Task List ordering/finalization, and NIPT-CBH reference tests unaffected.
5. Apply schema **before** the single source push / Production build. Rollback source does not alter assigned identifiers.
