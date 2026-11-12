# QuickCart — Upgrade 51: setup & what changed

## 1. Vercel environment variables (Settings → Environment Variables), then redeploy
| Variable | What for |
|---|---|
| `PAYSTACK_SECRET_KEY` | sk_live_… of the QuickCart account. Verifies payments, refunds the ₦50 card check, charges saved cards. |
| `QC_ENC_KEY` | A long random text (32+ characters). Encrypts saved card tokens and signs login sessions. **Keep a copy — if you lose it, saved cards cannot be read.** |
| `QC_ADMIN_PASSWORD` | Your platform-admin password. Log in with username `admin`. (The old `admin / admin` login is gone.) |
| `CRON_SECRET` | Any long random text. Lets the nightly jobs run (auto-billing + cloud backups). |
| `FIREBASE_DB_SECRET` | Firebase console → Project settings → Service accounts → **Database secrets** → show/copy. Lets the server keep working after you lock the database (step 2). |
| `QC_AUTOBILL` | Optional. Automatic card billing is ON by default. Set to `0` for a dry run that only lists who is due. |

## 2. Lock the database (do this AFTER step 1 is deployed and you have logged in once)
Firebase console → Realtime Database → **Rules** → paste the contents of `database.rules.json` → Publish.
This hides every account record (emails, password hashes), billing, payments and cloud backups from browsers.
Only the server (using `FIREBASE_DB_SECRET`) can read them. If anything misbehaves, paste your previous rules back.

Existing customers keep working: their old passwords are upgraded to a salted hash the next time they log in.

## 3. Sign-up, free trial and billing
* Prices: Starter ₦7,900 · Pro ₦16,590 · Enterprise ₦45,000 per month (edit in `api/_plans.js`).
* A new store is created as **“pending card”** and cannot use the dashboard until a card is added.
  Adding the card (Paystack’s secure card form) charges ₦50, refunds it immediately, saves the card and starts the 14-day trial.
* When the trial ends, the card is charged the plan price automatically (daily job at 06:00).
  No card or a declined card → the account locks until they add a card or pay.
* Customers can **remove or replace their card** any time: dashboard → Billing & Card. Removing it during the trial
  does not end the trial early; the account just locks when the trial ends unless a card is added.
* Existing trial accounts created before this upgrade have no saved card; they lock at trial end unless they add one.

## 4. Backup (dashboard → Backup)
* **Master ON/OFF switch** for all automatic backups.
* **External drive / folder (free):** pick a folder on the plugged-in drive (Chrome / Edge on a computer); backups are
  written there automatically (hourly / daily / weekly) while the dashboard is open. “Download backup file” works on any device.
* **Cloud backup (paid add-on, ₦2,500/month — change `BACKUP_ADDON` in `api/_plans.js`):** nightly snapshot kept 14 days
  (plus up to 20 manual ones) in YOUR Firebase under `/backups/<username>`. The customer subscribes with the Subscribe button,
  is billed from the saved card each month (they can switch auto-renew off), and restores with one click.
* **Customer lost their data?** Log in as `admin` → Backup → “Recover a customer’s data”: type their username, see all their
  cloud backups, Download or Restore. “Give free Cloud Backup…” grants the add-on without payment.

## 5. Outlets, many POS terminals, offline selling
* Dashboard → **Outlets & Sync**: add each branch. Human Resources → staff get an **Outlet** field.
* Every POS terminal, outlet and staff login writes to the owner’s one account, so all sales show on the owner dashboard
  (per-outlet and per-cashier totals are on the Outlets & Sync page).
* POS keeps selling with no internet: sales are saved on the device and uploaded automatically (and stock adjusted
  with safe server-side increments, so several offline tills never overwrite each other).
  Open the POS once online on each device so it can work offline later.
