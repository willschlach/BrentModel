# BrentModel

A rule-based Brent crude dynamic hedging model: it decides how much of each future exposure month to hedge, and with which instrument (futures, 25-delta calls, zero-cost collars). It includes a backtest and calibration framework and a web app to review the output.

> **Status:** the model and the app run end to end on **synthetic data only**. No real market data has been used, and several GS parameters are still assumptions. See `docs/`.

## Repository layout

```
backend/            Python model (pandas/numpy)
  brent_hedge/        signals, allocation, backtest, calibration, LSEG adapter, export
  tests/              unit tests
  requirements.txt
frontend/           React + Vite + TypeScript web app (deployed to Vercel)
  public/data/        where the Python export writes latest.json (git-ignored; no run data is committed)
  vercel.json         Vercel build and header settings
supabase/           Supabase project: config.toml, migrations/ (roles, rules, sign-in hook), tests/ (database tests)
docs/               specifications and design documents
```

The two halves meet at one file: `backend/` writes `frontend/public/data/latest.json` and the app reads it. The file is not committed, so the app shows "No run data yet" until you run the export locally. A later change moves run data behind Supabase sign-in. See `docs/Web_App_Design_Spec.md` for the schema.

## Run locally

**Backend** (Python 3.13):

```bash
cd backend
pip install -r requirements.txt
python -m unittest discover -s tests          # run tests
python -m brent_hedge.export --synthetic      # write frontend/public/data/latest.json (local, git-ignored)
python -m brent_hedge.cli backtest --synthetic
```

**Frontend** (Node 22):

```bash
cd frontend
npm ci
npm run dev        # http://localhost:5173
npm run build      # type-check and production build
```

Run npm commands inside `frontend/`, never at the repo root.

## Deploy the frontend to Vercel

1. In Vercel: **Add New > Project**, import this GitHub repo.
2. Set **Root Directory** to `frontend`. Vercel then reads `frontend/vercel.json` and detects Vite.
3. Under **Settings > Environment Variables**, add (Production and Preview):
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`

   Only these browser-safe values go in Vercel. Never add a Supabase secret / service-role key here.
4. Deploy. Vite reads the variables at build time, so redeploy after changing them.

Notes:

- The deployed app is static. It reads `/data/latest.json` if one is published, otherwise it shows "No run data yet". The Python backend does not run on Vercel. Model runs are a monthly batch job (run locally or from a scheduler), not a web request.
- `package-lock.json` must reference the public npm registry (`registry.npmjs.org`). If you regenerate it on a machine configured for a private registry, check it before committing: `grep -c codeartifact frontend/package-lock.json` should print `0`.
- Sign-in now gates the app, but run data is not yet behind row level security. Before real data is loaded, move it behind Supabase and review Vercel's Deployment Protection settings.

## Set up sign-in (Supabase)

Roles, statuses and the rules around them live in the database. See `docs/Auth_and_Roles.md` for the model, the planned role matrix, and recovery steps.

1. **Variables.** `frontend/.env.local` gets `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. The repo-root `.env` gets `SUPABASE_URL` and `SUPABASE_SECRET_KEY` (the secret key stays on trusted machines only).
2. **Migrations.** From the repo root, with the project linked, run `supabase db push`.
3. **Project settings.** In the Supabase dashboard, open Authentication and set these **in this order**, after the migrations are deployed (the full reasoning is in `docs/Auth_and_Roles.md`, "Project settings (hosted)"):
   1. Auth Hooks: Custom Access Token is `public.custom_access_token_hook`, and Before User Created is `public.hook_before_user_created`.
   2. Sign In / Providers, Email: **Confirm email** off.
   3. Sign In / Providers: **Allow new users to sign up** on, last. Until this is on, nobody can reach the sign-up flow; once it is on, anyone can open the sign-up page.

   Minimum password length is 8. These match `supabase/config.toml`, which only configures the local stack.
4. **First devops account.** From `backend/`, run `python -m brent_hedge.bootstrap_devops --email you@example.com`. It asks for a password and confirms the target project before creating anything.
5. **Invite people.** Sign in as devops, open **Invites**, create a code for an email and a role, and give the code to the person yourself (nothing is emailed). They use it on the **Create an account** page. Someone who signs up without a code becomes a pending request: devops and admins approve or reject it on the **People** page (a count appears beside the header link). To remove any account, for example a test account, use `python -m brent_hedge.remove_user --email <email>` from `backend/` (add `--disable` to keep the account but block access). Deleting an account also deletes its invite.
6. **Check.** Sign in, create an invite, and sign up with it in a private window. Sign up once with no code and confirm the page says the request is awaiting approval.

To work locally without touching the hosted project, use the local stack described in `docs/Auth_and_Roles.md`.

## CI/CD (GitHub Actions)

`.github/workflows/ci.yml` runs on every pull request and every push to `main`:

| Job | Checks |
| --- | --- |
| Frontend | lockfile uses the public npm registry, `npm ci`, typecheck, unit tests, build, no `data/latest.json` in the build |
| Backend | `python -m unittest discover -s tests` |
| Database | starts the local Supabase stack (applies every migration from scratch) and runs `supabase test db` |
| Deploy migrations | only on `main`, only after the three jobs above pass, and only when `supabase/migrations/` changed: links the hosted project, prints the pending migrations (dry run), then runs `supabase db push` |

The deploy job reads three repository secrets (Settings, Secrets and variables, Actions):

- `SUPABASE_ACCESS_TOKEN`: a personal access token from the Supabase dashboard (Account, Access Tokens).
- `SUPABASE_DB_PASSWORD`: the project's database password.
- `SUPABASE_PROJECT_ID`: the project ref (the first part of the project URL).

Recommended repository settings:
- Create an environment named `production` (Settings, Environments) and add yourself as a required reviewer. The deploy job then waits for your approval before touching the hosted database.
- Protect `main` and require the Frontend, Backend and Database checks before merging.

Notes:
- The workflow never pushes `supabase/config.toml`. Auth settings (hook, sign-ups, password length, redirect URLs) are applied in the dashboard; see "Set up sign-in".
- Never edit a migration that has already been applied. Add a new one instead, or the next push will refuse because the history no longer matches.
- Vercel deploys the frontend through its own GitHub integration. It does not wait for these checks, so keep `main` protected.
- Your first `supabase db push` can be done by hand. After that the pipeline finds nothing pending and does nothing.

## Secrets and data

- Never commit `.env` files, vendor data (LSEG), or GS source material. `.gitignore` covers `.env*`, `/data/`, `Dump.txt` and `Design.pptx`.
- Root `.env` (Python jobs) and `frontend/.env.local` (browser-safe values only) are created from the `.env.example` files.
- No run output is committed: `frontend/public/data/latest.json` is git-ignored. Anything in `frontend/public/data/` is served to anyone who has the URL, so do not deploy a build made on a machine where you ran the export with real data.

## Documents

- `docs/Brent_Dynamic_Hedging_Model.md`: the build specification and assumptions log
- `docs/Brent_Hedging_System_Overview.md`: stage-by-stage status for the business
- `docs/Web_App_Design_Spec.md`: web app design and data contract
- `docs/Auth_and_Roles.md`: sign-in, roles and statuses, the planned role matrix, and recovery steps
