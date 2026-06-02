# NIPT:NGS CBH

Internal laboratory management web application for the NIPT workflow at CBH. The
system covers sample registration, patient workflow, extraction Task Lists, QC
measurements, sample storage, stock management, HIS raw-file staging, result PDF
revisions, user administration, and audit logs.

The application is designed for an internal hospital network. It uses a
dedicated Supabase database for structured data and writes uploaded files
directly to a private local folder or NAS share controlled by the application
server.

## Contents

- [Scope](#scope)
- [Roles And Permissions](#roles-and-permissions)
- [Workflow Overview](#workflow-overview)
- [Functional Modules](#functional-modules)
- [Core Business Rules](#core-business-rules)
- [Architecture](#architecture)
- [Environment Variables](#environment-variables)
- [Installation](#installation)
- [Supabase Setup](#supabase-setup)
- [Storage And NAS Setup](#storage-and-nas-setup)
- [Microsoft Excel PDF Export](#microsoft-excel-pdf-export)
- [API Routes](#api-routes)
- [Database Migrations](#database-migrations)
- [Commands](#commands)
- [Testing And Verification](#testing-and-verification)
- [Production Deployment Checklist](#production-deployment-checklist)
- [Project Structure](#project-structure)
- [Deferred Work](#deferred-work)

## Scope

### Included In The Current Version

- Login with E-Phis ID and password.
- Role-based access for `Admin` and `CBH-Staff`.
- Atomic LN Halos generation using Bangkok time.
- Patient registry with gestational age, run type, workflow stage, result PDF
  revisions, and controlled sample deletion.
- Extraction batch management with three Task Lists per batch.
- Fixed Task List controls and 45 patient slots across a 48-position plate.
- Exact-template Task List PDF export.
- QC Measurements generated from finalized Task Lists.
- Manual concentration entry, Qubit raw-file staging, and exact-template QC PDF
  export.
- Sample Storage boxes with FIFO placement, retention dates, destruction
  records, and exact-template PDF export.
- Stock management with item masters, lot expiry, FEFO guidance, append-only
  ledger history, reversal transactions, warnings, and CSV export.
- HIS raw-file staging for future mapping and parsing.
- Private local or NAS-backed file storage.
- Admin user management and read-only audit logs.

### Deliberately Not Included Yet

- HIS field mapping and automatic import into patient records.
- Qubit instrument-file parsing into QC concentration fields.
- Pooling calculations and sequencing forms.
- Multiple stock locations, purchase orders, approval flows, pack conversion,
  barcode scanning, and stock sticker printing.
- Automated NAS snapshot management or restore orchestration.

## Roles And Permissions

| Capability | `CBH-Staff` | `Admin` |
| --- | --- | --- |
| Sign in and use protected pages | Yes | Yes |
| Register samples | Yes | Yes |
| Edit GA, move stage forward, and select run type | Yes | Yes |
| Move a sample stage backward | No | Yes |
| Delete an eligible sample record | No | Yes |
| Upload the first result PDF | Yes | Yes |
| Upload a revised result PDF | No | Yes |
| Void a result PDF revision | No | Yes |
| Auto-fill Task Lists and edit sheet metadata | Yes | Yes |
| Finalize Task Lists | Yes | Yes |
| Unlock finalized Task Lists | No | Yes |
| Auto-fill Sample Storage boxes | Yes | Yes |
| Record destruction of due storage boxes | Yes | Yes |
| Receive and issue stock | Yes | Yes |
| Adjust stock balances | No | Yes |
| Reverse own stock transactions | Yes | Yes |
| Reverse another user's stock transactions | No | Yes |
| Manage stock categories and item masters | No | Yes |
| Manage users and reset passwords | No | Yes |
| View the audit log | No | Yes |

All protected application mutations go through authenticated Next.js route
handlers and server-side permission checks. Browser clients do not receive the
Supabase service-role key.

## Workflow Overview

1. A staff member scans or enters an LN on the Dashboard.
2. The server atomically registers the sample and generates an LN Halos value.
3. Staff complete patient details in the Patient Registry, including GA, run
   type, and workflow stage.
4. Samples are assigned to extraction Task Lists using FIFO Auto-fill or urgent
   placement.
5. Each of the three Task Lists is completed and finalized.
6. When all Task Lists in a batch are finalized, the extraction batch advances
   and a QC Measurements sheet is created automatically.
7. Staff record QC concentrations manually or stage a Qubit raw file for future
   mapping.
8. Samples are placed into Sample Storage boxes using FIFO Auto-fill.
9. Result PDF files can be attached to patient samples with revision history.
10. Operational supplies are tracked independently in the Stock module.

## Functional Modules

### Dashboard

Path: `/dashboard`

The Dashboard is the intake entry point. Staff can scan or type an LN to
register a sample. Registration uses an atomic database function:

- Duplicate registration of the same LN returns the existing record.
- A new LN Halos sequence is generated in Bangkok time.
- The generated sequence is not reused after a sample is deleted.
- The daily sequence supports values from `001` to `999`.

The Dashboard also displays operational summary information for the NIPT
workflow.

### Patient Registry

Path: `/patients`

The Patient Registry provides searchable patient and sample records. Search
supports LN, LN Halos, HN, and patient name.

Editable workflow fields:

- Gestational age: weeks and days.
- Run type: `Normal`, `Re-Library`, or `Re-Sampling`.
- Workflow stage: `Received`, `Extract`, `Pooling`, `Sequencing`, or
  `Completed`.

Gestational age validation:

- Weeks and days must both be provided or both be blank.
- Weeks must be between `0` and `50`.
- Days must be between `0` and `6`.
- GA values at or above `22W` display a red warning.

Stage movement:

- Staff can move a sample forward through the workflow.
- Only Admin can move a sample backward.
- Rerun types can only advance to a higher rerun level.

Admin sample deletion is intentionally constrained. A sample can only be
deleted if it has no Task List assignment, no result PDF revision, and no
Sample Storage position. Deleting the record does not roll back the generated
LN Halos sequence, so the retired number is never reused.

### Result PDF Revisions

Result PDF files are managed from the Patient Registry sample detail panel.

- Staff can upload the first PDF result.
- Admin can upload later revisions.
- Each upload receives a revision number.
- Only one revision is active at a time.
- Admin can void an existing revision with a reason.
- The revision history remains available to Admin for traceability.
- Uploaded result files must use the `.pdf` extension and contain a PDF file
  signature.

### Extraction Task Lists

Path: `/task-lists`

Each extraction batch contains three Task Lists. A full batch uses a 48-position
plate:

| Task List | Slot Range |
| --- | --- |
| Task List 1 | `1-16` |
| Task List 2 | `17-32` |
| Task List 3 | `33-48` |

Three fixed control positions are reserved:

| Slot | Control |
| --- | --- |
| `1` | Positive control |
| `25` | Negative control |
| `40` | Blank control |

The remaining 45 positions are patient slots.

Supported actions:

- Create or use the current assembling batch.
- FIFO Auto-fill the next incomplete sheet.
- Add urgent samples to available patient positions.
- Record Task List metadata such as work date and operator.
- Export a selected Task List as PDF from the approved Excel template.
- Finalize a sheet after its required data is complete.
- Unlock a finalized sheet as Admin with a reason. Unlocking increments the
  revision.
- Edit the batch run label as Admin.

Task List exports append `-1` to printed IDs for the initial run. Patient IDs
follow the selected rerun suffix rules. Controls are also exported with `-1`;
control IDs do not advance to later rerun suffixes.

### QC Measurements

Path: `/qc-measurements`

A QC Measurements sheet is generated automatically when all three Task Lists in
an extraction batch are finalized and the 48-position plate is complete.

Supported actions:

- Record concentration values for all plate positions, including controls.
- Record sheet metadata such as work date and operator.
- Upload a Qubit raw file for future parser integration.
- Export the original `QC measurements` Excel sheet as PDF.

Qubit uploads are staged only. Accepted extensions are `.txt`, `.csv`, `.xls`,
and `.xlsx`, with a maximum size of 50 MB.

### Sample Storage

Path: `/sample-storage`

Sample Storage tracks physical boxes using a `9x9` layout with 81 positions.
Auto-fill uses FIFO order and places samples that have not already been stored.
When a box becomes full, the system creates or continues with the next filling
box.

Retention rules:

- A full box receives a destruction due date two years after it is completed.
- The UI warns when a destruction date is within 90 days.
- Due boxes can receive a destruction record with the destroyer's name and the
  logged-in recorder.
- The storage grid displays the full LN Halos value for each occupied position.

The PDF export writes LN Halos values into the approved storage-plan template.
The runtime exporter shrinks text to fit inside template cells without saving
changes back to the workbook.

### Stock Management

Path: `/stock`

Stock is a central-laboratory inventory ledger for reagents, kits, consumables,
and Admin-defined categories.

Admin master data:

- Categories with active status.
- Items with item code, name, category, base unit, minimum stock, lot tracking,
  expiry tracking, and active status.
- Expiry tracking can only be enabled when lot tracking is enabled.
- Items without lot tracking use an internal unspecified-lot record.

Stock ledger:

- Movement types are `receive`, `issue`, `adjustment`, and `reversal`.
- Movements use signed deltas.
- Existing movements cannot be updated or deleted.
- Corrections are recorded as reversal movements.
- Total stock cannot become negative.
- Staff can reverse their own movements.
- Admin can reverse any movement and must provide a reason.

Expiry and FEFO rules:

- Usable stock excludes expired lots.
- Low stock is reported when usable stock is less than or equal to the item's
  minimum stock.
- Lots expiring within 90 days are flagged.
- Expired lots can still be issued only after explicit user confirmation.
- Issue forms recommend a usable lot using FEFO: the nearest valid expiry first.
- Selecting a different lot requires an override reason.

Exports:

- `balances`: current balance snapshot.
- `movements`: receive, issue, adjustment, and reversal ledger.
- CSV files include a UTF-8 BOM so Thai text opens correctly in Excel.

### HIS Imports

Path: `/his-imports`

HIS import is currently a staging workflow. It accepts raw files for later
mapping and parser implementation.

Accepted extensions:

- `.txt`
- `.csv`
- `.xls`
- `.xlsx`

Uploads are stored with an `awaiting_mapping` status. The file-size limit is
50 MB.

### Admin And Audit Logs

Paths:

- `/admin`
- `/admin/users`

Admin can:

- Create a user from E-Phis ID, display name, role, and password.
- Activate or deactivate user access.
- Reset a user's password.
- View audit history.
- Manage the Admin-only actions described in each module.

An Admin cannot deactivate their own current account.

Audit entries are written for security-sensitive and operational actions,
including user changes, sample changes, result revisions, Task List changes,
storage destruction records, stock master changes, stock ledger movements, and
CSV exports.

## Core Business Rules

### LN Halos

LN Halos values are generated atomically by the database in Bangkok time:

```text
YYBYYMMDDNNN
```

Example structure:

| Segment | Meaning |
| --- | --- |
| First `YY` | Gregorian year from the Bangkok date, shortened to two digits |
| `B` | Fixed separator |
| Second `YYMMDD` | Gregorian date in Bangkok time |
| `NNN` | Daily running sequence, `001-999` |

The generator sequence is intentionally monotonic for the day. Deleted sample
numbers remain retired.

### Run Types And Printed Suffixes

| Run Type | Printed Suffix |
| --- | --- |
| `Normal` | `-1` |
| `Re-Library` | `-2` |
| `Re-Sampling` | `-3` |

Task List controls always use `-1`.

### Time Zone

Business dates are calculated with the `Asia/Bangkok` time zone. This applies to
LN Halos generation and date-sensitive workflow logic.

## Architecture

### Technology Stack

| Layer | Technology |
| --- | --- |
| Web framework | Next.js `16.2.6`, App Router |
| UI | React `19.2.4`, TypeScript, Tailwind CSS `4`, Lucide icons |
| Database and auth | Supabase Postgres, Supabase Auth, Supabase SSR |
| Validation | Zod |
| Unit and contract tests | Vitest |
| File storage | Server-local folder or Windows NAS UNC path |
| Excel PDF export | Microsoft Excel COM automation through PowerShell |

### Data Flow

```text
Browser
  -> Next.js protected pages and route handlers
  -> server-side DAL permission checks
  -> Supabase Auth and Postgres
  -> local or NAS file storage for raw uploads and PDFs
  -> Microsoft Excel automation for exact-template PDF exports
```

The Supabase service-role key is server-only. Browser sessions use Supabase SSR
cookies and read policies. Mutations are handled by authenticated server routes
or server-only database RPC calls.

### Protected Routes

`proxy.ts` protects:

```text
/dashboard/:path*
/patients/:path*
/task-lists/:path*
/qc-measurements/:path*
/sample-storage/:path*
/stock/:path*
/his-imports/:path*
/admin/:path*
```

When adding a new protected page such as `/reports`, also add its matcher to
`proxy.ts`. Otherwise unauthenticated visitors will not be redirected to the
login page.

## Environment Variables

Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env.local
```

Fill the following values:

| Variable | Required | Description |
| --- | --- | --- |
| `NEXT_PUBLIC_NIPT_SUPABASE_URL` | Yes | Dedicated Supabase project URL. Safe to expose to the browser. |
| `NEXT_PUBLIC_NIPT_SUPABASE_ANON_KEY` | Yes | Supabase anonymous key. Safe to expose to the browser. |
| `NIPT_SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service-role key. Keep server-side only. Never commit or expose it to the browser. |
| `NIPT_STORAGE_ROOT` | Production | Local folder or NAS root used by server-side uploads. Defaults to `./storage-dev` for local development; set an explicit UNC path in production. |
| `NIPT_TASK_LIST_TEMPLATE` | No | Optional absolute path to an approved Task List `.xlsm` workbook replacement. |
| `NIPT_SAMPLE_STORAGE_TEMPLATE` | No | Optional absolute path to an approved Sample Storage `.xlsx` workbook replacement. |

Recommended local `.env.local`:

```env
NEXT_PUBLIC_NIPT_SUPABASE_URL=
NEXT_PUBLIC_NIPT_SUPABASE_ANON_KEY=
NIPT_SUPABASE_SERVICE_ROLE_KEY=
NIPT_STORAGE_ROOT=./storage-dev
NIPT_TASK_LIST_TEMPLATE=
NIPT_SAMPLE_STORAGE_TEMPLATE=
```

Leave template variables blank to use the bundled approved copies:

```text
templates/NIPT Experimental Task List-G50_TH_CBH.xlsm
templates/Fm-WI-T-BM17-04-sample-storage.xlsx
```

## Installation

### Prerequisites

- Node.js version compatible with Next.js 16.
- npm.
- A dedicated Supabase project or hospital-managed Supabase instance.
- Microsoft Excel installed on the Windows account that runs the application
  server if PDF exports are required.
- Write permission to the configured local folder or NAS share.

### Install Dependencies

```bash
npm install
```

### Configure Environment

```powershell
Copy-Item .env.example .env.local
```

Edit `.env.local`, then run the storage probe:

```bash
npm run storage:check
```

### Start Development

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

## Supabase Setup

Use a dedicated Supabase project. Do not run these migrations against an
unrelated shared database.

Run migrations in order:

1. `supabase/migrations/202606010001_nipt_v1.sql`
2. `supabase/migrations/202606010002_sample_storage.sql`
3. `supabase/migrations/202606020001_qc_measurements.sql`
4. `supabase/migrations/202606030001_stock_management.sql`

After setting the Supabase variables in `.env.local`, create the first Admin:

```bash
npm run bootstrap:admin -- --ephis 12345 --name "NIPT Admin" --password "CHANGE-ME-123"
```

Bootstrap rules:

- E-Phis ID must contain digits only.
- Password must be at least eight characters.
- The script creates the Supabase Auth account and the `nipt_users` Admin
  profile.
- If profile creation fails, the script removes the newly created Auth account
  to avoid an incomplete bootstrap.

### Database Security

The migrations enable Row Level Security on exposed application tables.
Authenticated browser users receive read access where appropriate. Database
mutation functions that must bypass browser permissions are revoked from
`public`, `anon`, and `authenticated`, then granted only to `service_role`.

Important examples:

- Atomic sample registration and LN Halos generation.
- Stock receive, issue, adjustment, and reversal transactions.
- Append-only stock ledger enforcement.

## Storage And NAS Setup

The application writes files directly to `NIPT_STORAGE_ROOT`.

Local development:

```env
NIPT_STORAGE_ROOT=./storage-dev
```

Hospital NAS example:

```env
NIPT_STORAGE_ROOT=\\NAS-SERVER\NIPT\storage
```

Prefer a UNC path instead of a mapped drive letter. Windows services often do
not receive interactive-user drive mappings.

### Storage Folders

| Prefix | Purpose |
| --- | --- |
| `his-imports/YYYY-MM/` | HIS staging uploads |
| `qubit-imports/<qc-sheet-id>/` | Qubit raw-file staging uploads |
| `results/<ln-halos>/` | Patient result PDF revisions |

Storage protections:

- Maximum upload size is 50 MB.
- Storage keys are restricted to application-owned prefixes.
- Unsafe traversal and path separator input is rejected.
- Existing files cannot be overwritten.
- Result revisions must pass PDF type and file-signature validation.

### Verify Storage Access

Default configured root:

```bash
npm run storage:check
```

Explicit NAS path:

```bash
npm run storage:check -- --root "\\NAS-SERVER\NIPT\storage"
```

The probe creates the root if needed, writes a temporary file, reads it back,
and removes it.

For hospital permissions, service accounts, backup guidance, and the NAS
checklist, read [docs/local-nas-setup.md](docs/local-nas-setup.md).

## Microsoft Excel PDF Export

Task List, QC Measurements, and Sample Storage PDF exports use approved Excel
workbooks. They do not recreate document layouts in HTML.

Runtime export behavior:

1. The server queues Excel jobs so only one workbook automation job runs at a
   time.
2. PowerShell starts Excel with macros disabled.
3. Excel opens the approved template in read-only mode.
4. The script fills data cells in memory.
5. The original target sheet is exported as PDF.
6. The workbook closes without saving changes.
7. Temporary files are removed.

Templates:

| Export | Template | Sheet |
| --- | --- | --- |
| Task List | `templates/NIPT Experimental Task List-G50_TH_CBH.xlsm` | Selected Task List sheet |
| QC Measurements | `templates/NIPT Experimental Task List-G50_TH_CBH.xlsm` | `QC measurements` |
| Sample Storage | `templates/Fm-WI-T-BM17-04-sample-storage.xlsx` | Approved storage-plan sheet |

Requirements:

- Run the production app on Windows if these PDF exports are needed.
- Install Microsoft Excel for the Windows service account.
- Ensure the service account can start Excel automation.
- Keep approved template files under change control.

Runtime export must never save over an approved template.

The repository also contains `scripts/repair-task-list-template.ps1`. This is a
maintenance-only tool that intentionally changes a specified Task List workbook.
Use it only against an explicitly approved maintenance copy with a backup and
reviewed checksum. It is not part of normal application runtime.

## API Routes

All API routes are under `app/api/`.

### Authentication

| Method | Route | Purpose |
| --- | --- | --- |
| `POST` | `/api/auth/login` | Sign in with E-Phis ID and password |
| `POST` | `/api/auth/logout` | Clear the application session |

### Dashboard And Samples

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/dashboard` | Dashboard summary |
| `GET` | `/api/samples` | Search and list registered samples |
| `POST` | `/api/samples` | Atomically register an LN and generate LN Halos |
| `GET` | `/api/samples/[id]` | Read a sample detail |
| `PATCH` | `/api/samples/[id]` | Update editable patient workflow fields |
| `DELETE` | `/api/samples/[id]` | Admin-only deletion of an eligible sample |
| `GET` | `/api/samples/[id]/results` | Admin-only result PDF revision history |
| `POST` | `/api/samples/[id]/results/prepare` | Prepare a result PDF upload |
| `POST` | `/api/samples/[id]/results` | Commit the staged result PDF revision |
| `GET` | `/api/results/[revisionId]/download` | Download a result revision |
| `GET` | `/api/results/[revisionId]/file` | Read an authorized result file |
| `POST` | `/api/results/[revisionId]/void` | Admin-only void of a result revision |

### Extraction Batches And Task Lists

| Method | Route | Purpose |
| --- | --- | --- |
| `GET`, `POST` | `/api/batches/current` | Read or create the current assembling batch |
| `GET` | `/api/batches/[id]` | Read a batch detail |
| `PATCH` | `/api/batches/[id]` | Admin-only batch updates such as run label |
| `POST` | `/api/batches/[id]/autofill` | FIFO Auto-fill the next incomplete Task List |
| `POST` | `/api/batches/[id]/urgent` | Place an urgent sample |
| `PATCH` | `/api/batches/[id]/sheets/[sheet]` | Update Task List metadata |
| `POST` | `/api/batches/[id]/sheets/[sheet]/finalize` | Finalize a Task List |
| `POST` | `/api/batches/[id]/sheets/[sheet]/unlock` | Admin-only unlock with revision increment |
| `GET` | `/api/batches/[id]/sheets/[sheet]/export` | Export the approved Task List sheet as PDF |

### QC Measurements

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/qc-measurements` | List QC Measurements sheets |
| `PATCH` | `/api/qc-measurements/[id]` | Update a QC sheet |
| `GET` | `/api/qc-measurements/[id]/export` | Export the approved QC sheet as PDF |
| `POST` | `/api/qc-measurements/[id]/imports/prepare` | Prepare a Qubit raw-file upload |
| `POST` | `/api/qc-measurements/[id]/imports` | Commit a staged Qubit raw file |

### Sample Storage

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/sample-storage` | List boxes and positions |
| `POST` | `/api/sample-storage` | FIFO Auto-fill available storage positions |
| `POST` | `/api/sample-storage/[id]/destroy` | Record destruction of a due box |
| `GET` | `/api/sample-storage/[id]/export` | Export the approved storage-plan template as PDF |

### Stock

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/stock` | Read the stock workspace, balances, lots, and ledger |
| `POST` | `/api/stock/receipts` | Receive stock |
| `POST` | `/api/stock/issues` | Issue stock |
| `POST` | `/api/stock/adjustments` | Admin-only adjustment |
| `POST` | `/api/stock/movements/[id]/reverse` | Reverse an authorized movement |
| `POST` | `/api/stock/categories` | Admin-only category creation |
| `PATCH` | `/api/stock/categories/[id]` | Admin-only category update |
| `DELETE` | `/api/stock/categories/[id]` | Admin-only category deactivation |
| `POST` | `/api/stock/items` | Admin-only item creation |
| `PATCH` | `/api/stock/items/[id]` | Admin-only item update |
| `DELETE` | `/api/stock/items/[id]` | Admin-only item deactivation |
| `GET` | `/api/stock/export?report=balances` | Export current stock balances as CSV |
| `GET` | `/api/stock/export?report=movements` | Export the stock ledger as CSV |

### HIS, Storage, And Admin

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/his-imports` | List HIS staging imports |
| `POST` | `/api/his-imports/prepare` | Prepare an HIS staging upload |
| `POST` | `/api/his-imports` | Commit an HIS staging upload |
| `PUT` | `/api/storage/upload` | Write an authorized staged file to local or NAS storage |
| `GET` | `/api/admin/audit` | Admin-only audit history |
| `GET`, `POST` | `/api/admin/users` | Admin-only user listing and creation |
| `PATCH` | `/api/admin/users/[id]` | Admin-only role or active-status update |
| `POST` | `/api/admin/users/[id]/reset-password` | Admin-only password reset |

## Database Migrations

Run all migrations in filename order.

| Migration | Purpose |
| --- | --- |
| `202606010001_nipt_v1.sql` | Users, audit logs, patient samples, result revisions, extraction batches, Task Lists, slots, LN Halos generation, core permissions, and RLS |
| `202606010002_sample_storage.sql` | Sample Storage boxes, positions, retention dates, destruction records, and policies |
| `202606020001_qc_measurements.sql` | QC Measurements sheets, QC slots, Qubit staging records, auto-create workflow, and policies |
| `202606030001_stock_management.sql` | Stock categories, items, lots, append-only movements, atomic stock RPCs, FEFO-related data, and policies |

Contract tests for migration behavior live beside the migrations in
`supabase/migrations/*.test.ts`.

## Commands

| Command | Purpose |
| --- | --- |
| `npm install` | Install dependencies |
| `npm run dev` | Start the local Next.js development server |
| `npm run build` | Build the production application |
| `npm run start` | Start a previously built production application |
| `npm run lint` | Run ESLint |
| `npm test` | Run the Vitest suite once |
| `npm run test:watch` | Run Vitest in watch mode |
| `npm run bootstrap:admin -- --ephis <id> --name "<name>" --password "<password>"` | Create the first Admin |
| `npm run storage:check` | Verify configured local or NAS storage |

Recommended verification before release:

```bash
npm run lint
npm test
npm run build
```

## Testing And Verification

The test suite covers:

- LN Halos generation and workflow rules.
- GA validation.
- Task List slot allocation, controls, suffixes, metadata, finalization, unlock,
  and export behavior.
- QC Measurements auto-creation and raw-file staging.
- Sample Storage FIFO placement, retention, destruction, and export behavior.
- Stock FEFO guidance, low-stock warnings, expiry rules, no-negative-balance
  enforcement, reversal permissions, append-only ledger behavior, and CSV BOM.
- Storage path validation and PDF verification.
- Migration contracts including RLS and server-only RPC permissions.

Before hospital deployment, also perform an end-to-end browser pass:

1. Register a patient sample and verify LN Halos generation.
2. Edit GA weeks and days, close the detail panel, reopen it, and confirm the
   values persisted.
3. Fill and export all three Task Lists.
4. Finalize the Task Lists and confirm QC Measurements appears.
5. Update QC concentration values and export the QC PDF.
6. Auto-fill a Sample Storage box and export the storage-plan PDF.
7. Receive two stock lots, verify FEFO suggestion, issue stock, reverse a
   movement, and export both stock CSV reports.
8. Upload and download a result PDF revision.
9. Upload HIS and Qubit staging files.
10. Review audit records as Admin.

## Production Deployment Checklist

### Application Server

- Use an internal Windows server account dedicated to the application.
- Install Node.js, npm, and Microsoft Excel.
- Clone or deploy the repository to a controlled server folder.
- Create `.env.local` with production Supabase and NAS values.
- Run `npm install`, `npm run lint`, `npm test`, and `npm run build`.
- Start the app with `npm run start` using the hospital's selected Windows
  service manager.
- Put the app behind an internal reverse proxy with HTTPS.

### Database

- Use a dedicated production Supabase project or hospital-managed Supabase
  instance.
- Apply all migrations in filename order.
- Bootstrap the first Admin once.
- Store the service-role key as a server-side secret.
- Configure database backups and test restoration.

### NAS

- Prefer a UNC path such as `\\NAS-SERVER\NIPT\storage`.
- Grant the application service account read, write, and folder-create
  permission.
- Do not grant normal lab users direct write access.
- Run `npm run storage:check -- --root "<UNC path>"` using the same service
  account that will run the app.
- Configure NAS snapshots and test restore procedures.

### Excel Templates

- Install Excel for the application service account.
- Confirm Task List, QC, and Sample Storage exports from the production account.
- Keep approved workbook templates backed up and change-controlled.
- Do not edit production templates during normal runtime.

### Network And Operations

- Allow access only from the hospital network.
- Configure internal HTTPS and firewall rules.
- Add service monitoring and log retention.
- Document restart procedures.
- Test database and NAS restores before go-live.

## Project Structure

```text
app/
  (protected)/              Protected UI pages
  api/                      Authenticated route handlers
components/                 Shared React UI
lib/
  auth/                     Session, actor, and permission helpers
  nipt/                     NIPT workflow domain logic
  storage/                  Local and NAS storage validation and file I/O
scripts/
  bootstrap-admin.mjs       First Admin bootstrap
  check-storage.mjs         Local or NAS write/read/delete probe
  export-task-sheet.ps1     Task List exact-template PDF export
  export-qc-measurements.ps1
                             QC exact-template PDF export
  export-sample-storage.ps1 Sample Storage exact-template PDF export
  repair-task-list-template.ps1
                             Maintenance-only Task List workbook repair
supabase/
  migrations/               Ordered SQL migrations and contract tests
templates/                  Approved Excel workbooks used for PDF export
docs/
  local-nas-setup.md        Hospital NAS operations guide
proxy.ts                    Protected-route redirect matcher
```

## Deferred Work

- Provision the hospital NAS share and test the real UNC path from the final
  Windows service account.
- Select the final production Supabase hosting model: dedicated cloud project or
  hospital-managed self-hosted instance.
- Install the application under the chosen Windows service manager.
- Configure internal HTTPS, firewall rules, monitoring, NAS snapshots, and
  restore testing.
- Add HIS parsing and field mapping after receiving a real sample file.
- Add Qubit parsing after receiving a real instrument file.
- Add pooling calculations and sequencing forms.
- Add NAS backup automation if required by hospital operations.
- Consider barcode scanning and sticker printing as a future stock extension.
