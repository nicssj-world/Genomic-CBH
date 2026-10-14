# Genomic CBH — Identifier, Prefix/Suffix & Status Logic Baseline

**Baseline date:** 2026-10-15 (Asia/Bangkok)  
**Source of truth for this snapshot:** `nicssj-world/Genomic-CBH`, `main` commit `57443f2b4c0ccf5f1827c64646e7bd891c103c37`.  
**Purpose:** Preserve the existing Genomic CBH semantics before temporary intake/label UX changes. Give the separate NIPT CBH implementation an explicit, versioned reference. **This document is not an instruction to copy all Genomic CBH code into NIPT CBH.**

## 0. Provenance and interpretation

- **[CODE]** = behavior verified in the referenced source code/migration/tests.
- **[OWNER/NIPT TARGET]** = a separate owner-approved requirement for the future NIPT CBH; not evidence that Genomic CBH already implements it.
- **[GAP]** = observed difference, missing integration, or important assumption that must not be silently filled in.
- Dates described as Bangkok dates are Gregorian calendar dates in the `Asia/Bangkok` time zone (`UTC+07:00`), **not Buddhist Era year strings**.
- Distinguish the original **HIS LN**, the immutable base **LN Halos**, the derived **Run Sample ID**, and the **physical-label printed code**. Do not concatenate/split by guesswork.
- A `B` in LN Halos is a fixed character in the identifier; it **does not represent Batch B** or a dynamically selected workflow state.

## 1. Identifier vocabulary and ownership

| Field / concept | Meaning | Change/uniqueness contract |
| --- | --- | --- |
| `nipt_samples.id` | Internal sample UUID | Database identity; never inferred from LN strings. |
| `nipt_samples.ln` | Original HIS LN / scanned accession, currently validated as a 10-digit LN in Dashboard | Unique in Genomic CBH. Re-scanning the same LN returns the original sample, not a second record. |
| `nipt_samples.ln_halos` | Stored **base** LN Halos | Unique in database; assigned on first accepted registration. Never modify to represent a run type. |
| `SampleRow.lnHalos` | **Display** LN Halos | For `Twin`, `D` is appended in `listSamples()`; for `Single`, the base is displayed unchanged. **Do not assume this equals the database column.** |
| `SampleRow.runSampleId` | Derived Run Sample ID | `SampleRow.lnHalos + RUN_SUFFIX[runType]`; this is a presentation/run identifier, not a fresh monthly allocation. |
| `SampleRow.importedAt` | `nipt_samples.imported_at` | Genomic CBH's manual registration time. Not equivalent to collection date or a later `.pet` receive date. |
| `collectionDate`, `receivedDate` | Imported metadata fields | May be empty and must be kept distinct from actual manual registration time. |
| `runId` | `nipt_sample_runs.id` UUID | Uniquely identifies a run attempt record. New run types produce another run row. |
| `batch.id` / `runLabel` | Extraction-batch identity / display label | Independent of patient LN Halos; see §6. |

**Critical boundary:** NIPT CBH should use a proper specimen-round and attempt identity for a repeat/resampling, rather than treating `R` or `-2` as a newly allocated base LN Halos.

## 2. Base LN Halos generation [CODE]

**Exact pattern:** `YYBYYMMDDNNN` (12 characters). Example: `26B261012001`.

| Part | Example | Rule |
| --- | --- | --- |
| `YY` | `26` | Last two digits of **Gregorian** calendar year in Bangkok. |
| `B` | `B` | Fixed literal. |
| `YYMMDD` | `261012` | Bangkok-local date on which the accession was first registered/generated. |
| `NNN` | `001` | Three-digit number `001–999`, **incremented across dates within the same Bangkok calendar month**. |

- The date segment still changes from Oct 12 to Oct 14, but `NNN` does **not** reset on Oct 14. Example: `26B261012010` then `26B261014011`; the month switch on Nov 1 permits `26B261101001`.
- The first successful registration allocates atomically in the database using `nipt_monthly_sequences` and `register_nipt_sample(...)`. The monthly table's primary key is the Bangkok month-start date.
- Duplicates by HIS LN return `{ duplicate: true, sample_id, ln_halos }` without consuming a fresh identifier; registration is protected by a per-LN advisory lock.
- Deletion does **not** release or recycle an allocated sequence. The generator fails above 999 rather than silently wrapping.
- `lib/nipt/rules.ts:formatLnHalos()` mirrors the database formatting and validates `NNN` range; `lib/nipt/rules.test.ts` has month-boundary examples.
- **Historical anchor approved by owner:** HIS LN `2628270019` = `26B261012001`, first registered sample of October 2026. Later October numbering is continuous. Migration `202610140001_nipt_monthly_ln_halos.sql` backfills with an audit mapping and safety checks, instead of rewriting clinical evidence without reconciliation.
- **[GAP]** Code and migration being present in GitHub does not independently prove that migration ran in the actual Production database. Validate the database migration history before relying on live numbering.

## 3. Run type and suffix mapping [CODE]

From `lib/nipt/rules.ts`:

| Run type (`nipt_sample_runs.run_type`) | Single Run Sample ID | Twin Run Sample ID | Explanation |
| --- | --- | --- | --- |
| `Normal` | `BASE-1` | `BASED-1` | Initial run. |
| `Re-Library` | `BASE-2` | `BASED-2` | Repeat library preparation. |
| `Re-Sampling` | `BASER` | `BASEDR` | New specimen/re-sampling **display/run suffix**, using `R` without a hyphen. Twin adds `D` **before** `R`. |

Example `BASE = 26B261012001`:

- Normal Single: `26B261012001-1`; Normal Twin: `26B261012001D-1`.
- Re-Library Single: `26B261012001-2`; Twin: `26B261012001D-2`.
- Re-Sampling Single: `26B261012001R`; Twin: `26B261012001DR`.

Implementation: `effectiveLnHalos = pregnancyType === 'Twin' ? base + 'D' : base` in `lib/server/data.ts`; then `formatRunSampleId(effectiveLnHalos, runType)` attaches one of `-1`, `-2`, `R`.

- Allowed types in code: `Normal`, `Re-Library`, `Re-Sampling`; progression is **forward only** by their array order.
- On a forward run-type change: the prior run row is marked inactive, another `nipt_sample_runs` row is inserted, and a rerun audit record is logged.
- A previously created same-type run is rejected. **Do not interpret run suffix alone as complete multi-round clinical lineage**.
- **[GAP]** A second `.pet` event with the same HIS LN is **not** handled as an automated new specimen round in this manual-intake Genomic CBH registration function: the LN deduplication returns the pre-existing sample.

## 4. Physical label printing is not the same as run suffix [CODE]

`lib/nipt/label-print.ts:buildTubeLabelsHtml()` produces **4 stickers at 60 × 20 mm**, split into **8 halves** (two 30-mm labels per sticker) for each selected sample:

| Sticker | Left half | Right half |
| --- | --- | --- |
| 1 | `DISPLAY_LN_HALOS` | `DISPLAY_LN_HALOS` |
| 2 | `DISPLAY_LN_HALOS` | `DISPLAY_LN_HALOS` |
| 3 | `DISPLAY_LN_HALOS` | `DISPLAY_LN_HALOS-1` |
| 4 | `DISPLAY_LN_HALOS-2` | `DISPLAY_LN_HALOS-3` |

- Every half includes the **HIS LN on a separate line**: `LN: <HIS LN>`; optional name is below.
- This function takes `ln`, `lnHalos`, and `patientName`; it **does not use `runType` or `runSampleId`**. Thus changing a sample to `Re-Sampling` does not automatically cause its four stickers to print `R`.
- For Twin the display base already includes `D`, so the 4-sticker pattern uses the `D`-decorated display value.
- This is not a barcode/QR encoding. The print view uses text.
- **[GAP / DO NOT SILENTLY COPY]** The printed `-3` on the fourth sticker is a **label-position/storage convention**; it is not an enumerated `Re-Library` or third clinical run type. Future NIPT CBH label behavior must follow its approved print contract separately.
- If resampling-specific labels must carry `R` on all physical labels, that is an explicit future feature, **not current code behavior**.

## 5. Workflow stages and meaning [CODE]

`nipt_sample_runs.stage` has the ordered values:

1. `Received` — registered, eligible for extraction queue.
2. `Extract` — assigned to extraction work.
3. `Pooling` — progressed past extraction.
4. `Sequencing` — progressed to sequencing.
5. `Completed` — workflow completed.

- Staff can advance stages; only Admin can move stages backwards. The state belongs to a **run**, not to a string suffix.
- Batch status is a separate enum: `assembling`, `extract`, `pooling`, `sequencing`, `completed`. Do not assume exact one-to-one transition timing with sample stages.
- `sample.activeResult` is revision/file state; it is not a replacement for `Completed`.
- The proposed **end-of-day marker** is an **operational UI annotation only**, never a stage, run type, batch state, or reason to change an LN.

## 6. Extraction batches, Task Lists and control IDs [CODE]

- Default batch label generated by database: `RunNNN/YYYY`, e.g. `Run001/2026` (`NNN` increments per Gregorian Bangkok **year**). Admin may edit the label; UUID is the real batch identity.
- A batch contains Task List 1 = plate slots `1–16`; Task List 2 = `17–32`; Task List 3 = `33–48`. Full plate = 48 slots, 45 patient positions.
- Reserved controls: position **1** positive, **25** negative, **40** blank. Controls are not patient LN Halos.
- Control code format: `YYNnYYYYMMDD`, where `n=1` positive, `2` negative, `3` blank, with the Task List's `workDate`. Examples for 2026-06-01: `26N120260601`, `26N220260601`, `26N320260601`.
- The task-sheet exported/printed ID for each **control** always ends `-1` (e.g. `26N120260601-1`). A patient slot uses `sample.runSampleId` (`BASE-1`, `BASE-2`, `BASER`, or Twin equivalents).
- Task List sheet header labels `S1`/`S2` in `buildTaskSheetTemplatePayload()` are metadata (`RunNNN S1-1/3`, `RunNNN S2-1/3`), **not** suffixes to append to patient LN Halos.
- Plate positions are `A1–H6`, derived from 1–48; storage grid is `A1–I9` (81 positions). Do not confuse these positions with identifier suffixes.
- Sample-storage view derives `D` for Twin where applicable and uses an extra `-3` for **Backup Box** display labels. Again, `-3` is not an enumerated clinical run state.
- FIFO Task List auto-fill selects an available **active run** in `Received` ordered by `nipt_samples.imported_at`, then run creation time. It does not use the largest LN Halos as its primary FIFO key.

## 7. HIS PET, re-sampling and independent NIPT CBH contract

**[CODE: current Genomic CBH]** The dashboard registers a manually scanned ten-digit LN via `POST /api/samples`. An existing HIS LN is deduplicated. Original `imported_at` is retained. Code does not establish a new receive date merely because a `.pet` file was generated again.

**[OWNER/NIPT TARGET: separate system]** For the future on-premises NIPT CBH with HIS `.pet` intake and `RES/OK` output:

1. A genuinely new `.pet` for re-sampling must create a **new specimen round** for the **same HIS LN**, not silently discard it as a same-LN duplicate and not allocate a fresh base LN Halos without the approved lineage rule.
2. Retain previous specimen and audit history; set that new round's **Receive Date** from the new `.pet` event, without overwriting the previous round's historical receive timestamp.
3. Reuse the approved base lineage and derive `R` / `DR` for printed/run IDs as appropriate; distinguish specimen round from analytical repeat attempt (Re-Library).
4. A repeat of the **same specimen** does not create a new specimen receipt/LN allocation merely to express a changed analytical attempt.
5. Use the final approved NIPT CBH sample-flow and label documents to settle conflicts; **never import a Genomic CBH UI shortcut as an HIS/LIS processing rule**.
6. The owner also locked NIPT CBH's Excel Task List template and 2-page PDF fidelity in a separate decision. This Genomic CBH document does not amend those template requirements.

**[GAP]** Genomic CBH's forward-only type ordering and same-HIS-LN deduplication cannot, alone, model multiple independent `.pet` recollections. NIPT CBH must use explicit specimen-round data and tests.

## 8. Proposed temporary Genomic CBH end-of-day marker (not an NIPT workflow status)

**Intent:** An operator can mark the **last actually registered sample of a Bangkok calendar day** in the Patient Registry, with the marker also visible on the Dashboard. The marker is a persisted checkpoint for staff handover.

Behavioral contract for this temporary feature:

- One active marker maximum per Bangkok intake day; it points to a sample UUID, not to an LN/suffix.
- Only the chronologically latest currently registered sample **of that day** can be marked. Same-timestamp tie-break uses UUID deterministically.
- Operators may change or remove the marker; the change must be authenticated and audit-logged.
- A later new registration on the same Bangkok date invalidates the earlier marker (not silently leaving an earlier row labeled 'last').
- No changes to `ln`, `ln_halos`, `run_type`, `stage`, `received_date`, patient data, Batch, Task List, or print labels.
- A delete of the marked sample must not leave a dangling marker. The marker cannot transfer automatically to another sample.
- A marker is **manual** confirmation that intake was expected to be finished when clicked. It is **not a clinical specimen-completion status**, not the time the HIS receives a PET file, not an automatic day-close that blocks late arrivals, and not something to copy into NIPT CBH without an independent requirement.
- Safe rollout: apply the **additive Genomic CBH-only** database migration first, then deploy the matching application change. If the migration has not been run, the code must report an error rather than pretend marking succeeded.

## 9. Regression and migration guardrails

- Check `202610140001_nipt_monthly_ln_halos.sql` has run in the **actual Genomic CBH database**; verify month counters and historical mapping first.
- Never run a Genomic CBH migration against the distinct NIPT CBH project.
- Unit checks: monthly sequence rollover, LN deduplication, Normal/Re-Library/Re-Sampling suffixes, Twin `D` ordering, four-sticker print output (`base/base`, `base/base`, `base/base-1`, `base-2/base-3`), control `N1/N2/N3`, fixed `-1` for controls, and independent Task List placement.
- End-of-day checks: no markers by default, set/remove, replace on same date, two dates independently, chronological latest check, idempotent rescans, later same-day intake invalidation, next-day behavior, deleting marked sample, permissions and audit.
- Source references from the snapshot: `lib/nipt/rules.ts`, `lib/nipt/rules.test.ts`, `lib/server/data.ts`, `lib/nipt/label-print.ts`, `lib/nipt/label-print.test.ts`, `lib/nipt/task-sheet-template.ts`, `components/patients-view.tsx`, `components/dashboard-view.tsx`, `README.md`, `supabase/migrations/202606010001_nipt_v1.sql`, `supabase/migrations/202610140001_nipt_monthly_ln_halos.sql`.

## 10. Separation / change-control rule

**For NIPT CBH integration, treat §§1–7 as a timestamped reference, §8 as Genomic CBH-only temporary UI functionality, and §9 as test guidance.** Future code changes in Genomic CBH do not revise the owner-approved NIPT CBH architecture unless the NIPT CBH specification is explicitly updated and reviewed.