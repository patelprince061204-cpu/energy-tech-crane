# Deploy to Hostinger — The Simple Way

**Read once, top to bottom. Do each line in order. No step is optional.**
Total time: about 30–40 minutes the first time.

You need: a Hostinger plan that runs **Node.js** (VPS, or Cloud/Business with
the "Node.js" app feature), your domain, and this project folder.

---

## PART A — Prepare (5 min)

**A1.** Generate two secret values on your own computer. Open a terminal and run:

```
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Run it **twice**. Copy both long strings into a notepad. Label them
`APP_SECRET` and (keep the second spare). You'll paste one in Part D.

**A2.** Decide your ERP web address. Most people use the main domain for the
website and a subfolder `/erp/` for the ERP — that already works out of the
box with this project. Nothing to do here, just know: the ERP lives at
`https://yourdomain.com/erp/`.

---

## PART B — Create the database (10 min)

**B1.** Log in to Hostinger → **hPanel**.

**B2.** Left menu → **Databases** → **MySQL Databases**.

**B3.** Under "Create a New MySQL Database":
- Database name: type `etc_erp` (Hostinger adds a prefix — that's fine).
- Username: type `etc_user` (again, a prefix is added).
- Password: click **Generate**, then **copy it to your notepad**.
- Click **Create**.

**B4.** Scroll down to "List of Current MySQL Databases". Write down, exactly
as shown, into your notepad:
- **Database name** (the full name with prefix, e.g. `u123456_etc_erp`)
- **Database user** (full, e.g. `u123456_etc_user`)
- **Database host** — usually `localhost`. If Hostinger shows a different host
  under "Remote MySQL", use that instead.

You now have 4 database values saved: name, user, password, host.

---

## PART C — Upload the project (10 min)

**C1.** In hPanel, open **Files** → **File Manager** (or use SFTP if you prefer).

**C2.** Go to the folder your Node app will run from. On a Hostinger Node.js
setup this is the folder you pick when you create the Node app (Part E). A
common choice is a folder named `etc` in your home directory.

**C3.** Upload the **entire contents** of this project's `integrated/` folder
into that folder. When done, that folder should directly contain
`server.js`, `package.json`, the `pages/`, `public/`, `erp-server/`,
`erp-client/` folders, etc. (NOT a nested `integrated/integrated/`.)

> Tip: zip the `integrated` folder on your computer, upload the single zip,
> then use File Manager's **Extract** — much faster than uploading files
> one by one.

---

## PART D — Create the .env file (5 min)

**D1.** In File Manager, open the `erp-server` folder inside your project.

**D2.** Find the file `.env.example`. Right-click → **Copy**, then rename the
copy to exactly **`.env`** (a dot, then `env`, no `.txt`).

**D3.** Open `.env` and fill in your saved values. It should end up looking
like this (use YOUR values from Parts A and B):

```
DB_HOST=localhost
DB_PORT=3306
DB_USER=u123456_etc_user
DB_PASSWORD=the_password_you_generated_in_B3
DB_NAME=u123456_etc_erp
DB_CONNECTION_LIMIT=25

ALLOWED_ORIGIN=

APP_SECRET=the_first_long_string_from_A1
```

**D4.** Leave `ALLOWED_ORIGIN` **empty** (the website and ERP are on the same
domain, so no cross-origin access is needed). Save the file.

> If you also want the "Forgot Password" email feature, fill in `EMAIL_USER`
> and `EMAIL_PASS` (a Gmail **App Password**, not your normal password). If you
> skip it, everything else still works — an admin can reset staff passwords
> from inside the ERP.

---

## PART E — Turn it on (5 min)

**E1.** In hPanel, find **Node.js** (under "Advanced" or "Website" depending on
your plan). Click **Create Application** (skip if you already made one in C2).
- **Application root**: the folder where you uploaded the project.
- **Application startup file**: `server.js`
- **Node version**: 18 or higher.
- **Environment**: add one variable here too → name `NODE_ENV`, value
  `production`. (This makes the app refuse to run with an unsafe secret — a
  safety feature.)
- Click **Create**.

**E2.** Install dependencies. In the Node.js app panel there's a **Run NPM
Install** button — click it. (Or open the Terminal and run `npm install` in
the project folder.)

**E3.** Click **Start** (or **Restart**) on the Node app.

**E4.** Open `https://yourdomain.com` in your browser — the website loads.
Open `https://yourdomain.com/erp/` — you'll see a **"Create your Admin
account"** screen the very first time. Create it. That becomes your permanent
admin login.

---

## PART F — Make it secure & permanent (5 min)

**F1.** In hPanel → **SSL** → enable the free **Let's Encrypt SSL** for your
domain. Wait a few minutes, then confirm your site loads on `https://`
(padlock icon). The app already sends HTTPS-enforcing headers, so once SSL is
on, browsers stay on https.

**F2.** In hPanel → **Databases** → find **Backups** (or "Automatic Backups")
and make sure database backups are ON. This protects your ERP data.

**F3.** Done. Bookmark `https://yourdomain.com/erp/`.

---

## Updating the site later (2 min)

When I send you a new version:

1. Upload the new files over the old ones (File Manager → Extract the zip,
   overwrite).
2. **Do NOT overwrite `erp-server/.env`** — that's your live config. (If a new
   version adds a setting, I'll tell you which line to add.)
3. In the Node.js panel, click **Restart**.
4. Hard-refresh your browser once (Ctrl+F5).

---

## If something doesn't work

| Symptom | Fix |
|---|---|
| Website loads but `/erp/` is a white screen | Node app isn't running — hit **Restart** in the Node.js panel. |
| ERP says it can't connect to the database | Re-check the 4 DB values in `.env` (Part D) match hPanel exactly, including the `u123456_` prefix. |
| App won't start, log says "APP_SECRET is not set" | You left `APP_SECRET` blank or as the placeholder. Paste a real value from step A1 and restart. |
| "Too many login attempts" | That's the brute-force protection. Wait 15 minutes. |
| Changes don't show | Hard-refresh (Ctrl+F5); the site uses cache-busting so this is rare. |

That's the whole deployment. The app falls back to file-storage if the
database isn't configured, so even a partial setup won't crash — but for the
live site, do finish Parts B and D so your data is in MySQL.
