# MedRemind — Offline-first Android app setup

> The app no longer needs XAMPP, PHP or MySQL. Everything the app shows is stored
> on the phone. Only **sign in** and **medicine search** talk to Supabase.

**Already connected:** the app points at the Supabase project
`https://jmaicawttnzzdtfetcyx.supabase.co`. Its URL and anon key are hard-coded at
the top of `js/supabase.js`, and `medicine_catalog` exists with 14 starter rows.
Steps 1–4 only need repeating if you move to a *different* Supabase project.
Email confirmation is currently **ON** for this project (see Step 5).

---

## Ki ki internet lagbe, ki lagbe na

| Feature | Where the data lives | Internet? |
|---|---|---|
| Sign in / Create account | Supabase Auth | **Yes** |
| Medicine search (catalog suggestions) | Supabase `medicine_catalog` | **Yes** |
| Medicines, stock, refill | Phone (`localStorage`) | No |
| Schedules, dose history, compliance | Phone (`localStorage`) | No |
| Profile, notification settings | Phone (`localStorage`) | No |
| Reminders / notifications | Phone (Capacitor Local Notifications) | No |

So: **ekbar sign in korle, internet chara o app purno vabe cholbe.**
The session is kept on the device, so opening the app offline goes straight to
the dashboard.

Because data is per device, two phones signed into the same account have separate
medicine lists. Clearing app storage or uninstalling removes the local data.

---

## Step 1 — Create a Supabase project

1. Go to <https://supabase.com> and sign in.
2. **New project** → pick a name, database password and region → **Create**.

## Step 2 — Create the medicine catalog table

1. In the project, open **SQL Editor → New query**.
2. Paste the whole of [`supabase/schema.sql`](supabase/schema.sql) and press **Run**.
3. Check **Table Editor** shows `medicine_catalog` with a few starter rows.

This creates the table, a read-only policy, and some sample medicines for the
search box. You can add more rows in **Table Editor → medicine_catalog**.

## Step 3 — Copy the project URL and anon key

Supabase dashboard → **Project Settings → API**:

- **Project URL** — looks like `https://abcdefghijklmnop.supabase.co`
- **Project API keys → anon / public** — the long `eyJ...` value

Only the **anon public** key goes in the app. Never put the `service_role` key in
the app.

## Step 4 — Put them in the app

Two options; the first one needs no rebuild.

**A. Inside the app (recommended)**

Open the app → on the login screen tap **Server settings** → paste the Project URL
and the anon key → **Save connection**. It is stored on the phone and checked
against Supabase immediately.

**B. Hard-coded default**

Already done — edit the top of `js/supabase.js` to point somewhere else:

```js
const SUPABASE_URL = "https://your-project.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOi...";
```

Anything saved from **Server settings** overrides these values, so users can
still change the project without a rebuild.

## Step 5 — Decide about email confirmation (optional)

Supabase → **Authentication → Sign In / Providers → Email**:- **Confirm email ON** (current setting for this project) — after creating an
  account the app asks the user to open the confirmation email first, then sign in.
- **Confirm email OFF** — signing up lands straight on the dashboard. Handy while
  testing.

The app handles both cases.

## Step 6 — Build the APK

```bash
npm run copy-web      # copy the HTML/JS into www/
npx cap sync android  # push www/ into the Android project
npx cap open android  # then Build -> Build APK(s)
```

APK output: `android/app/build/outputs/apk/debug/app-debug.apk`

After any HTML/JS change, run `npm run copy-web` and `npx cap sync android` again.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| "Supabase is not connected yet" | Tap **Server settings** on the login screen and save the Project URL + anon key. |
| "Connected to Supabase, but the medicine catalog table is missing" | Run `supabase/schema.sql` in the SQL editor. |
| "Supabase rejected the anon key" | Copy the **anon public** key again (not `service_role`, not the JWT secret). |
| "Signing in needs an internet connection" | Expected offline. Sign in once while online, then the app works offline. |
| "Please confirm your email address before signing in" | Open the confirmation email, or turn **Confirm email** off in Supabase. |
| Medicine search shows "needs internet" | Expected — the catalog is in Supabase. Typing the name manually still works. |
| Meds/schedules disappeared | Local data was cleared (app data cleared or app uninstalled). Local data is per device, there is no server copy. |
| Reminders do not fire | Allow notifications for MedRemind, and turn battery optimisation off for the app. |

---

## What changed in the code

| File | Role |
|---|---|
| `js/supabase.js` | Supabase Auth (sign in, sign up, refresh, password change) and medicine catalog search. The only file that uses the network. |
| `js/store.js` | Offline store for medicines, schedules, dose logs and profile (`localStorage`, scoped per user). |
| `js/config.js` | Shared helpers plus `api()` — sends auth/search routes to Supabase, answers every other route from `js/store.js`. |
| `supabase/schema.sql` | Catalog table, read-only policy, starter rows. |
| `backend/` | The old PHP + MySQL API. **No longer used by the app**; kept for reference only. |
