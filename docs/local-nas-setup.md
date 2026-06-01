# Local NAS Setup

The NIPT webapp can run entirely inside the hospital LAN. Files are written by the Next.js server process to `NIPT_STORAGE_ROOT`.

## Development Folder

Use a local folder while developing away from the hospital:

```bash
NIPT_STORAGE_ROOT=./storage-dev
```

The server creates subfolders automatically:

```text
storage-dev/
  his-imports/YYYY-MM/
  results/LN-HALOS/
```

## Hospital NAS

On the hospital Windows server, use a UNC path:

```bash
NIPT_STORAGE_ROOT=\\NAS-SERVER\NIPT\storage
```

Run the Node.js process under a dedicated service account that has read/write permission on that share. Do not rely on a mapped drive such as `Z:` because mapped drives may not exist inside a Windows service session.

Verify the share from the same service account:

```bash
npm run storage:check -- --root "\\NAS-SERVER\NIPT\storage"
```

Recommended folder permissions:

- The NIPT service account: read, write, create folders.
- Lab users: no direct write access. Upload and download through the webapp.
- IT backup account: read access for backup jobs.
- Other accounts: deny access unless explicitly required.

## Network Checklist

1. Create the NAS share and a dedicated service account.
2. Put the UNC path in `.env.local`.
3. Run `npm run storage:check` from the intended Windows service account.
4. Install Microsoft Excel for the same Windows service account so exact-template Task List PDF export can run.
5. Start the webapp from that service account.
6. Export each `Ext. & Prep. Task List` sheet once and confirm that Excel opens and closes without a prompt.
7. Upload one HIS test file and one PDF result.
8. Confirm that both appear under the NAS folder.
9. Download the PDF from another computer on the LAN.
10. Configure NAS snapshots and an independent backup destination.
11. Add internal HTTPS before entering real patient data.

## Database

The filesystem adapter is independent from the database host. During development, the app can use a dedicated Supabase Cloud project. For hospital deployment, point the same environment variables to Supabase Self-hosted inside the LAN.

Keep the database and NAS on backed-up infrastructure. A NAS share is primary file storage, not a complete backup strategy.
