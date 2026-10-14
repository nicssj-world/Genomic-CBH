# Genomic CBH — Identifier, Manual Print Marker, and Registry Contract
Owner lock: 2026-10-15. **Temporary Genomic workflow only**, not NIPT-CBH clinical governance. This addendum supplements the preserved source audit: \`docs/GENOMIC_CBH_IDENTIFIER_STATUS_BASELINE_2026-10-15.md\`.

## Identifier namespaces (immutable)
- HIS LN is text, preserve leading zeros. LN Halos BASE is \`YYBYYMMDDNNN\` (Asia/Bangkok; Gregorian date; monthly counter 001–999). Duplicate scans retain BASE; deleted identifiers are retired. Never reset the counter daily.
- Effective BASE for Twin is \`BASED\`. \`runSampleId\`: Normal \`BASE-1\`; Re-Library \`BASE-2\`; Re-Sampling \`BASER\` (with Twin, \`BASED-1\`, \`BASED-2\`, \`BASEDR\`). Run stages \`Received/Extract/Pooling/Sequencing/Completed\` are not identity suffixes.
- Physical 60×20 mm labels: **4 stickers, 8 halves**: \`(BASE, BASE)\`, \`(BASE, BASE)\`, \`(BASE, BASE-1)\`, \`(BASE-2, BASE-3)\`. Printed half codes \`-1/-2/-3\` do **not** assert that an analytical rerun occurred. Every half prints LN Halos above \`LN: <HIS LN>\`. Never add barcode/QR or silently change print geometry.
- Controls: \`YYN1YYYYMMDD\` positive, \`YYN2YYYYMMDD\` negative, \`YYN3YYYYMMDD\` blank; distinct from patient BASE. Batch \`RunNNN/YYYY\`, box \`BoxNNN/YYYY\` are independent labels.
- NIPT-CBH clinical S2+ redraw may get a **new BASE** under the same HIS LN. Genomic \`R\` means a simplified rerun type and must not be copied as NIPT redraw identity.

## New Owner Lock — one global manual marker
The marker means **first specimen to start printing next time**, *not* the last printed specimen. Any authorized staff can manually mark A then B; one database singleton pointer is replaced under a row lock, so A stops being marked globally. It survives reload/day/another workstation, including when the marked sample is not among the 50 visible rows. Staff can jump to the marker or clear it. Deleting that sample clears its pointer; it does not select another automatically.

Mark does not imply the physical print completed, never follows a browser print dialog, and does not alter specimen stage, LN Halos, run type, task slots, or NIPT clinical state. Atomic marker changes append actor/old/new sample-id audit.

The earlier \`nipt_intake_day_end_markers\` records mean *last received sample per Bangkok day*, with potentially many dates. They are historical data and **are not the one active print marker**. Existing historical records are retained, but competing star/mark actions are removed from Dashboard/Patient Registry to avoid two contradictory meanings.

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
