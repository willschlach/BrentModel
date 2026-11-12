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
  public/data/        latest.json: the run snapshot the app reads (synthetic in this repo)
  vercel.json         Vercel build and header settings
supabase/           Supabase project config (migrations will live here)
docs/               specifications and design documents
```

The two halves meet at one file: `backend/` writes `frontend/public/data/latest.json` and the app reads it. See `docs/Web_App_Design_Spec.md` for the schema.

## Run locally

**Backend** (Python 3.13):

```bash
cd backend
pip install -r requirements.txt
python -m unittest discover -s tests          # run tests
python -m brent_hedge.export --synthetic      # refresh frontend/public/data/latest.json
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

- The deployed app is static. It reads `/data/latest.json`, so the Python backend does not run on Vercel. Model runs are a monthly batch job (run locally or from a scheduler), not a web request.
- `package-lock.json` must reference the public npm registry (`registry.npmjs.org`). If you regenerate it on a machine configured for a private registry, check it before committing: `grep -c codeartifact frontend/package-lock.json` should print `0`.
- Pages are not access-controlled yet. Before real data is loaded, add Supabase sign-in and review Vercel's Deployment Protection settings.

## Secrets and data

- Never commit `.env` files, vendor data (LSEG), or GS source material. `.gitignore` covers `.env*`, `/data/`, `Dump.txt` and `Design.pptx`.
- Root `.env` (Python jobs) and `frontend/.env.local` (browser-safe values only) are created from the `.env.example` files.
- The sample `frontend/public/data/latest.json` is synthetic and safe to publish. Do not write real run output there in a public repo.

## Documents

- `docs/Brent_Dynamic_Hedging_Model.md`: the build specification and assumptions log
- `docs/Brent_Hedging_System_Overview.md`: stage-by-stage status for the business
- `docs/Web_App_Design_Spec.md`: web app design and data contract
