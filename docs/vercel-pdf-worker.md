# Vercel PDF export with a secure Windows Excel worker

The approved NIPT Task List, QC Measurements, and Sample Storage PDF exports use
Windows Excel COM. Vercel runs Linux Node.js functions and cannot invoke COM.
To preserve the approved Excel layouts, keep the original PowerShell scripts
and templates on a hospital-managed Windows worker, and call it from Vercel
using an authenticated HTTPS tunnel.

This feature does NOT modify database schemas, batch state, user authorization,
or the approved workbook templates.

## Windows server setup

1. Use Windows with Microsoft Excel and Node.js installed.
2. Checkout the SAME Git revision as the Vercel app. Keep templates/ and
   scripts/ present. Run the worker under a Windows account able to start
   Excel COM and access its printer configuration.
3. Generate a strong random secret of at least 32 characters. In PowerShell:
   $env:NIPT_PDF_WORKER_TOKEN = [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
4. Set the NIPT_PDF_WORKER_TOKEN in the worker's permanent service environment.
   Never place the secret in Git, a browser, or public logs.
5. Launch: node scripts/pdf-export-worker.mjs
6. Locally check: http://127.0.0.1:3907/health
7. Route a hospital-approved Cloudflare Tunnel or equivalent TLS endpoint to
   http://127.0.0.1:3907. Protect it with Access service credentials when
   possible. NEVER expose the worker port directly to the public network.

Optional Windows environment variables:
- NIPT_PDF_WORKER_PORT (default 3907)
- NIPT_TASK_LIST_TEMPLATE (approved absolute .xlsx template path)
- NIPT_SAMPLE_STORAGE_TEMPLATE (approved absolute .xlsx template path)

## Vercel Production environment

The same Vercel project serving Genomic-CBH must have server-side variables:
- NIPT_PDF_WORKER_URL = https://your-hospital-controlled-worker.example
- NIPT_PDF_WORKER_TOKEN = same strong secret as on Windows

If using Cloudflare Access service tokens, also configure:
- NIPT_PDF_WORKER_CF_ACCESS_CLIENT_ID
- NIPT_PDF_WORKER_CF_ACCESS_CLIENT_SECRET

Redeploy once AFTER the Windows service and HTTPS tunnel are working.

## Data security and fidelity

The worker only accepts authenticated, bounded JSON requests for three
fixed export types. It never accepts caller-controlled file paths. It opens
approved Excel workbooks read-only, serializes COM conversions, returns the
PDF bytes, and removes temporary files. Requests can contain sample IDs
and operator names; treat the HTTPS tunnel and service as clinical data
processing infrastructure. Do not send this data to public PDF SaaS.

Excel formats the PDF using the approved workbook, not a recreated HTML
version. Verify the Task List's 2-page layout and Thai fonts against the
old Windows output, as well as Task Lists 1/2/3, QC, and 9x9 Sample Storage.

## Test checklist

- Windows: Excel COM can open and export a synthetic-data workbook.
- Windows worker health response, invalid-token rejection, valid synthetic
  task-list export, output starts with %PDF-, worker process logs no sample ID.
- Vercel: Task List preview/download, task-list 1/2/3 page count/layout,
  QC after a qualifying finalized sheet, Sample Storage 9x9.
- No request succeeds silently if the worker is stopped or the token is wrong.
- Concurrent requests must not run multiple Excel COM jobs simultaneously.
- The Vercel request allows 55 seconds for a response. For slower jobs, plan
  an asynchronous queue; do not assume raising timeouts is safe.

Important: the linked Vercel connector may not have access to the actual
Genomic-CBH deployment. Production is not fixed until its environment
variables and Windows service are configured and a live PDF export passes.
