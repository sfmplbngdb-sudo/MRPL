# Truck Ledger — Web App

A 4-module truck/order ledger (Order Entry → Gate & Lorry → Freight & Payment → Invoice & Broker) built with plain HTML/CSS/JS and Supabase. No build step — deploys straight to GitHub Pages for free.

## What's inside
```
truck-app/
├── index.html        Login / sign-up page
├── app.html           Dashboard + 4-module wizard
├── masters.html        Manage dropdown data (Consignors, Consignees, Grades, Brokers, etc.)
├── css/style.css        Shared "ledger book" theme
├── js/config.js          ← put your Supabase URL + anon key here
├── js/auth.js            Login/signup/session logic
├── js/app.js              Wizard logic, calculations, cancel/back flow
├── js/masters.js           Master data CRUD
└── sql/schema.sql          Run once in Supabase to create all tables
```

## 1. Create the Supabase project
1. Go to supabase.com → New project.
2. Once it's ready, open **SQL Editor** → paste the entire contents of `sql/schema.sql` → **Run**.
   This creates all master tables, the main `truck_entries` table, `gc_details`, `audit_log`, and turns on Row Level Security (only logged-in users can read/write).
3. Go to **Authentication → Providers** and make sure **Email** is enabled. For quick testing, under **Authentication → Settings**, you can turn off "Confirm email" so new accounts can sign in immediately.
4. Go to **Project Settings → API** and copy the **Project URL** and **anon public key**.

## 2. Connect the app to Supabase
Open `js/config.js` and paste your values:
```js
const SUPABASE_URL = "https://xxxxx.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOi...";
```

## 3. Add your master data
Sign in once, open **Master Data** in the top bar, and add your real Consignors, Consignees, Destinations, Grades, DCA, Unloading Points, Brokers and A/C Holders. Sample rows are pre-seeded by the SQL script — delete the ones you don't need.

## 4. Push to GitHub and deploy (free, via GitHub Pages)
```bash
cd truck-app
git init
git add .
git commit -m "Truck ledger app"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/truck-ledger.git
git push -u origin main
```
Then on GitHub: **Settings → Pages → Source: Deploy from branch → main / (root)**. Your app will be live at `https://YOUR-USERNAME.github.io/truck-ledger/`.

> Because `js/config.js` holds only the **anon public** key (not a secret — it's meant to be public, protected by Row Level Security), it's safe to commit and publish.

## How the workflow behaves
- **Module 1 → 2 → 3 → 4 → Completed**: each "Save & go to Module X" writes the row to `truck_entries` and advances `status`.
- **Cancel / back**: the "← Back to Module N" button on Modules 2–4 moves the same record's status back one step — nothing is deleted. **"Cancel this truck"** (top of the wizard) works from any module and marks the whole entry `cancelled`, keeping full history in the audit log.
- **Data Change tracking**: every time you edit a field on a record that already exists (including editing an earlier module after completion), the old and new values are written to `audit_log`.
- **Auto-fill fields**: Grade Name (from Grade), Broker Number (from Broker), ADV A/C Number & IFSC (from A/C Holder), GatePass Date & Time (the moment you fill Get Pass No), Timestamp Time (the moment you save Module 1), C Qty (A Qty + your manual adjustment), Total PMT / Total Freight / Advance (Module 3), and GC amounts split by weight (Module 4.2) all calculate live in the browser.
- **Multiple GC (Module 4.2)**: toggle "Yes" to add any number of GC numbers with weights; each GC's payout amount is automatically its weight-share of Module 3's Total Freight.

## Scaling to 10 lakh+ rows: indexing & pagination
Two things make or break performance once `truck_entries` grows into the lakhs:

**1. Indexes** (in the database) — already built into `sql/schema.sql`. If you ran the *old* schema.sql before this update, just run `sql/indexes_for_scale.sql` once in the Supabase SQL Editor — it's additive and safe to run on a live table. It adds:
- A `(status, created_at)` index — the dashboard's main query (filter by status, sort by newest) uses this.
- Indexes on every foreign key (consignor, consignee, broker, grade, etc.) so dropdown lookups and joins stay fast.
- **Trigram (GIN) indexes** on DO Number, Lorry No, Invoice No, Eway Bill No — this is what makes the search box return results in milliseconds instead of scanning a million rows on every keystroke.

**2. Pagination** (in the app) — the dashboard no longer loads "all" rows (it used to cap at 200, which silently hides data past that). It now:
- Fetches **50 rows at a time** using Supabase's `.range()`, with Prev/Next buttons — the database only ever sends 50 rows over the network, regardless of whether the table has 500 or 50,00,000 rows.
- Avoids running an exact `COUNT(*)` (slow on huge tables) — instead it fetches 51 rows and uses the 51st to know whether a "Next" page exists.
- Has a **search box** (DO Number / Lorry No / Invoice No / Eway Bill No / Get Pass No / Indent No / So Number) and a **status filter**, both applied *in the database query* — not by loading everything and filtering in the browser.

If you want to filter by a date range too (e.g. "this month only"), that's a small addition — the `entry_date` and `invoice_date` indexes are already in place for it; just ask and I'll wire up the UI.

## One formula you may want to double-check
`ADVANCE = Total Freight − LM − PM − UN EXP − MRP Diesel − BAL` is implemented in `recalcModule3()` in `js/app.js`. If your actual business rule differs slightly from this, it's a one-line change in that function.

## Notes
- This is a static, no-build app — any code editor + GitHub is all you need going forward; there's nothing to compile.
- Row Level Security is currently "any logged-in user can read/write everything." If later you need per-user restrictions or read-only roles, that's a small addition to the policies in `schema.sql`.
