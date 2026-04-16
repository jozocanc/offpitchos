# Club Files — Design

**Date:** 2026-04-16
**Status:** Approved (awaiting spec review)
**Phase 1 scope:** Club-wide files only. Team-scoped files = Phase 2.

## Goal

Give DOCs a centralized place to share important documents (registration forms, code of conduct, season calendar, handbooks) with everyone in their club. Coaches and parents can view and download. Inspired by SportsYou's "Files" feature.

## Non-Goals (Phase 1)

- Per-team files
- Folders / nested directories
- Notifications on upload
- File versioning
- In-browser preview (rely on browser default behavior on download)
- Bulk upload
- File replace / rename (just delete + re-upload)

## Architecture

### Storage

- Supabase Storage bucket: `club-files` (private)
- Path convention: `club-files/{club_id}/{uuid}-{original_filename}`
- Signed URLs (1 hour expiry) generated on download click

### Database

New table `club_files`:

| Column         | Type        | Notes                                    |
|----------------|-------------|------------------------------------------|
| id             | uuid PK     | default gen_random_uuid()                |
| club_id        | uuid FK     | references clubs(id) on delete cascade   |
| name           | text        | original filename, used for display/search |
| storage_path   | text        | full path in `club-files` bucket         |
| size_bytes     | bigint      | for display                              |
| mime_type      | text        | for icon selection                       |
| uploaded_by    | uuid FK     | references profiles(id)                  |
| uploaded_at    | timestamptz | default now()                            |

Index: `(club_id, uploaded_at DESC)` for list queries.

### Permissions (RLS)

- **SELECT:** any user whose `profiles.club_id` matches the row's `club_id`
- **INSERT:** user's role must be `'doc'` AND `profiles.club_id` matches
- **DELETE:** user's role must be `'doc'` AND `profiles.club_id` matches
- **UPDATE:** disallowed (no rename in Phase 1)

Storage bucket policies mirror the same rules.

### Routes / Files

- `app-next/app/dashboard/files/page.tsx` — server component, lists files
- `app-next/app/dashboard/files/files-client.tsx` — client component, search + upload UI + download/delete handlers
- `app-next/app/dashboard/files/actions.ts` — server actions: `uploadFile`, `deleteFile`, `getDownloadUrl`
- `app-next/app/dashboard/files/loading.tsx` — skeleton loader
- `app-next/components/sidebar.tsx` — add Files nav item (no `roles` filter — visible to all)
- Supabase migration: create `club_files` table + RLS policies + storage bucket policies

## UI

### List page (`/dashboard/files`)

```
┌─ Files ────────────────────────────────────┐
│  [🔍 Search files…]         [+ Upload] DOC │
│                                            │
│  📄 Registration Form 2026.pdf             │
│     Uploaded by Jozo · 2d ago · 1.2 MB     │
│     [Download] [Delete] (DOC only)         │
│                                            │
│  📄 Code of Conduct.pdf                    │
│     Uploaded by Jozo · 1w ago · 340 KB     │
│     [Download]                             │
└────────────────────────────────────────────┘
```

- Newest first
- Search filters client-side by filename (case-insensitive substring match)
- File icon by extension family: PDF, DOC/DOCX, IMG (jpg/png/heic), VID (mp4/mov), generic
- Uploader name pulled via join on `profiles`
- Relative timestamp ("2d ago") — same `timeAgo` helper as notification-bell
- Empty state: "No files yet" + Upload CTA (DOC only)

### Upload modal (DOC only)

- Triggered by `+ Upload` button
- Single file picker (no multi-select Phase 1)
- Client-side validation:
  - Size < 25 MB
  - Extension not in blocklist: `.exe`, `.js`, `.sh`, `.bat`, `.cmd`, `.com`, `.scr`, `.msi`
- On submit: upload to Storage → insert DB row → close modal → refresh list
- Errors surface as toast (existing toast component)

### Delete (DOC only)

- Inline `[Delete]` button on each row
- Confirm dialog: "Delete {filename}? This cannot be undone."
- On confirm: delete storage object → delete DB row → toast → refresh list

## Data Flow

### Upload

1. DOC selects file in picker
2. Client validates size + extension
3. `uploadFile` server action receives FormData
4. Server re-validates (defense in depth)
5. Upload to Supabase Storage at `club-files/{club_id}/{uuid}-{name}`
6. Insert row into `club_files`
7. If storage upload succeeds but DB insert fails → delete storage object (cleanup)
8. Revalidate `/dashboard/files`

### List

1. Server component reads `auth.user`, joins `profiles` for `club_id` + `role`
2. Query: `select * from club_files where club_id = $1 order by uploaded_at desc`
3. Join uploader name from `profiles`
4. Pass rows + role to client component

### Download

1. User clicks `[Download]`
2. `getDownloadUrl` server action generates signed URL (1hr) for `storage_path`
3. Client opens URL in new tab → browser handles download

### Delete

1. DOC clicks `[Delete]` → confirm
2. `deleteFile` server action: verify role = doc, verify file's `club_id` matches user's club
3. Delete from Storage
4. Delete DB row
5. Revalidate

## Edge Cases

| Case                          | Handling                                          |
|-------------------------------|---------------------------------------------------|
| File >25 MB                   | Toast error, upload blocked client-side + server-side |
| Blocked extension             | Toast error, blocked client + server              |
| Same filename uploaded twice  | Both kept; UUID prefix in storage_path prevents collision; uploader + date disambiguate in UI |
| Storage upload fails          | No DB row inserted; toast error                   |
| Storage succeeds, DB fails    | Delete storage object; toast error                |
| Deleting last file            | List shows empty state                            |
| User has no club              | Page shows "Join a club first" (existing pattern) |
| Non-DOC tries to upload via API | Server action rejects (role check + RLS)        |
| Signed URL expired            | User clicks download again to get fresh URL       |

## Testing

- Manual smoke test as DOC: upload PDF, search, download, delete
- Manual smoke test as Coach: see file list, no upload button, no delete buttons, can download
- Manual smoke test as Parent: same as coach
- Verify size limit (try 26MB file)
- Verify blocked extension (try .exe)
- Verify cross-club isolation: log in as different club's DOC, confirm files don't appear

## Out of scope / Phase 2 plan

- **Team files tab** in Team detail page (`/dashboard/teams/[id]`) — same data model with added `team_id` column on a separate table `team_files`, or unified table with nullable `team_id`. To be designed in Phase 2.
- **Notifications on upload** — push + attention panel entry when DOC uploads a club file. Defer until users ask.
