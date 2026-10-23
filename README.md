# NIIS API Tester (local testing only)

A throwaway React + Tailwind page for trying NIIS backend features by
clicking. It is not part of the product. Two tabs:

- **Media library (#26)**: the central library (SRS CMS-007, RFP 2.2.6) and
  field reports going into it (SRS FR-012).
- **Social posting (row 57)**: Facebook posting (the niis-api `social` app).

Everything here is local:

- The backend runs from the niis-api folder on **http://127.0.0.1:8001**, with
  its **own SQLite file** (`backend/local_test.sqlite3`).
- Its **own storage** runs in Docker: MinIO, plus an nginx that copies the
  production storage setup (`backend/storage/nginx.conf`).
- It never touches the production database in `niis-api/.env.staging` or
  production storage.
- The JWT and payload keys in `backend/keys/` are throwaway keys made for this
  tester only (`setup.bat` makes them on each machine).

## What you need

- **Docker Desktop**, **Node.js** (18 or newer) and **Git**.
- **niis-api** cloned **next to this folder**, on a branch that has both the
  `media_library` and `social` apps, with its venv made:

  ```
  Github\
    niis-api\                 <- python -m venv venv, then venv\Scripts\pip install -r requirements.txt
    NIIS Frontend Testing\    <- this repo
  ```

  If niis-api is somewhere else, set `NIIS_API` to its folder before running
  the scripts (PowerShell: `$env:NIIS_API = "D:\code\niis-api"`).

In **PowerShell**, start the scripts with `.\` from this folder, for example
`.\run-frontend.bat` and `.\backend\setup.bat`.

## One-time setup

1. Start **Docker Desktop**.
2. Run `backend\setup.bat`. It:
   - makes throwaway JWT and payload keys in `backend\keys\` (git-ignored)
   - makes `backend\local.env` from `local.env.example`
   - starts the storage containers
   - migrates the local database
   - creates the buckets: `niis-media` and `niis-documents` public-read,
     `niis-library` private, as on the server
   - creates the field-report approval workflow (DPRO, then editor)
   - adds the test users below

| User | Role | District | Department |
|---|---|---|---|
| `admin` / **admin@123** | admin (can open Swagger) | - | - |
| `editor1` | editor | - | - |
| `dpro_kohima`, `apro_kohima` | DPRO, APRO | Kohima | - |
| `dpro_dimapur` | DPRO | Dimapur | - |
| `fo_kohima` | field officer | Kohima | Agriculture |
| `fo_kohima2` | field officer | Kohima | Health & Family Welfare |
| `ia_dimapur` ("Imna") | IA | Dimapur | Agriculture |
| `fo_none` | field officer | none | Health and Family Welfare |
| `analyst` | media analyst (no library) | - | - |

Every password is `Test@12345`, except `admin` (`admin@123`).

## Every time

| Run | What it does |
|---|---|
| `backend\run-storage.bat` | MinIO + nginx (Docker Desktop must be running) |
| `backend\run-backend.bat` | API on port 8001. Swagger: http://127.0.0.1:8001/api/docs/ (log in as admin / admin@123) |
| `run-frontend.bat` | The app at http://127.0.0.1:5173 |

To look inside storage: MinIO console http://127.0.0.1:9101 (`niislocal` /
`niislocal-secret`).

## Media library test flow

Open the **Media library** tab. The login buttons switch user in one click.
Section **6. What to check** in the app is the full checklist; the short
version:

1. **fo_kohima**: upload a phone photo. Open it: it has the DIPR watermark and
   no GPS. Upload one more as **private**.
2. **fo_kohima2**: sees the district photo, not the private one. Saving gives
   403.
3. **dpro_kohima / apro_kohima**: see both. **ia_dimapur / dpro_dimapur**: see
   neither.
4. **fo_kohima**: share the private photo with "Imna" (find by name), then with
   the department "Health & Family Welfare". Check from those users.
5. **fo_kohima**: rotate / crop / convert, restore an old version, "Use in
   article" (the public URL opens logged out).
6. Chunked upload of a 40-60 MB video with the progress bar.
7. Section 5: **fo_kohima** creates and submits a field report with a photo.
   **dpro_kohima** approves, then **editor1** approves. The photo appears in
   the library with the purple "field report" tag.
8. **editor1**: open "the bin", restore something.
9. **analyst**: the library page says 403. That is expected.

The **API log** at the bottom shows every request and response.

Swagger lists the media endpoints under **Media Library**, about a third of the
way down. Swagger only draws the sections near the screen, so scroll to it.

Testing switches users often, so `backend/local.env` raises the login and
write limits. Production keeps 5 logins and 10 writes per minute per user.

## Social posting flow

Fill `FACEBOOK_APP_ID` / `FACEBOOK_APP_SECRET` in `backend\local.env` (never
commit that file), restart `run-backend.bat`, log in as
`testadmin` / `testeditor` (password `Test@12345`) on the **Social posting**
tab, and run `backend\run-due-posts.bat` for scheduled posts. The computer
must be able to reach `graph.facebook.com`.

## Starting again

Delete `backend\local_test.sqlite3` and run `setup.bat` again. To also empty
storage: `docker compose -f backend\storage\docker-compose.yml down -v`.
