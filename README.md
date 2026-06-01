# NIPT:NGS CBH

Standalone Next.js 16 webapp for NIPT sample intake, patient workflow, extraction Task Lists, QC measurements, HIS and Qubit raw uploads, result PDF revisions, and audit logs.

## V1 Features

- Login with E-Phis and password. Roles: `Admin`, `CBH-Staff`.
- Atomic LN Halos generation in Bangkok time: `YYBYYMMDDNNN`.
- GA editing with red warning at `>= 22W`.
- Manual stages: `Received`, `Extract`, `Pooling`, `Sequencing`, `Completed`.
- Rerun suffixes: Normal `-1`, Re-Library `-2`, Re-Sampling `-3`.
- One assembling extraction batch with 45 patient samples and fixed controls at slots `1`, `25`, `40`.
- FIFO Auto-fill by Task List, urgent fill, per-sheet metadata, finalize lock, Admin unlock revision, and exact-template PDF export.
- QC Measurements auto-created after all three Task Lists are finalized, manual concentration entry for all 48 slots, Qubit raw upload staging, and exact-template PDF export from the original `QC measurements` sheet.
- Sample Storage boxes with FIFO Auto-fill, 9×9 positions, two-year retention countdown after all 81 slots are filled, due warnings, and destruction records.
- Private local or NAS storage for HIS raw files and result PDF revisions.
- Admin user management and read-only audit log.

## Local Environment

Copy `.env.example` to `.env.local` and fill:

```bash
NEXT_PUBLIC_NIPT_SUPABASE_URL=
NEXT_PUBLIC_NIPT_SUPABASE_ANON_KEY=
NIPT_SUPABASE_SERVICE_ROLE_KEY=
NIPT_STORAGE_ROOT=./storage-dev
NIPT_TASK_LIST_TEMPLATE=
```

`NIPT_STORAGE_ROOT` can be a development folder or a Windows UNC path such as `\\NAS-SERVER\NIPT\storage`. Keep the service-role key server-side only.

Leave `NIPT_TASK_LIST_TEMPLATE` blank to use the bundled workbook at `templates/NIPT Experimental Task List-G50_TH_CBH.xlsm`. Set it only when the hospital wants to point at an approved replacement copy.

## Supabase Setup

The app works with a dedicated Supabase Cloud project during development or Supabase Self-hosted inside the hospital LAN.

1. Create a dedicated Supabase project.
2. Run [supabase/migrations/202606010001_nipt_v1.sql](supabase/migrations/202606010001_nipt_v1.sql).
3. Run [supabase/migrations/202606010002_sample_storage.sql](supabase/migrations/202606010002_sample_storage.sql).
4. Run [supabase/migrations/202606020001_qc_measurements.sql](supabase/migrations/202606020001_qc_measurements.sql).
5. Fill the Supabase variables in `.env.local`.
6. Bootstrap the first Admin:

```bash
npm run bootstrap:admin -- --ephis 12345 --name "NIPT Admin" --password "CHANGE-ME-123"
```

The migration enables RLS on exposed tables and grants browser users read policies only. Mutations run through authenticated route handlers and server-only DAL checks.

## Storage Setup

The Next.js server writes files directly to `NIPT_STORAGE_ROOT`. Uploads are limited to 50 MB, storage keys are constrained to app-owned folders, existing files cannot be overwritten, and result revisions must contain a PDF signature.

For the hospital NAS procedure, service account permissions, backup checklist, and UNC path guidance, read [docs/local-nas-setup.md](docs/local-nas-setup.md).

Test a local folder now:

```bash
npm run storage:check
```

## Local Run

```bash
npm install
npm run lint
npm test
npm run build
npm run dev
```

Open `http://localhost:3000`. For LAN access, run the production build on an internal server and expose it behind the hospital reverse proxy with internal HTTPS.

Task List and QC Measurements PDF exports run locally through Microsoft Excel automation. Install Microsoft Excel on the Windows server account that runs the app. The app opens the approved `.xlsm` template with macros disabled, fills data-only cells, and exports the selected original sheet without recreating its layout.

## Deferred Work

- Provision the hospital NAS share and test with its real UNC path.
- Choose dedicated Supabase Cloud for development or Supabase Self-hosted for hospital production.
- Install the app as a Windows service or container on the internal server.
- Configure internal HTTPS, firewall rules, monitoring, NAS snapshots, and restore testing.
- Add HIS parsing and field mapping after receiving a real sample file.
- Add Qubit parsing after receiving a real instrument file.
- Add pooling calculations, sequencing forms, and NAS backup automation.
