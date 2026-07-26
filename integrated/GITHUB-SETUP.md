# Put This Project on GitHub — Step by Step

A GitHub repo gives you version history, a backup, and an easy way to pull
updates. This guide assumes you've never used git. ~15 minutes.

Your project is already **safe to commit**: `.gitignore` is set up so your
secrets (`.env`), dependencies (`node_modules`), and runtime data never get
uploaded. You verified this — good.

---

## Option 1 — The easy way (GitHub Desktop, no commands)

**1.** Install **GitHub Desktop** from https://desktop.github.com and sign in
   with a free GitHub account.

**2.** Menu → **File** → **Add Local Repository** → choose this project's
   `integrated` folder. It'll say "this isn't a git repository — create one?"
   → click **Create a repository**.

**3.** On the create screen: Name it `energy-tech-crane`. Leave the rest
   default. Click **Create Repository**.

**4.** GitHub Desktop now shows a list of files to include in the first commit.
   **Confirm `.env` is NOT in the list** (it should be greyed out / ignored).
   If you ever see `.env` listed, STOP and tell me — don't commit it.

**5.** Bottom-left: type a summary like `Initial commit` → click **Commit to
   main**.

**6.** Top bar → **Publish repository**. Choose **Private** (recommended for a
   business project). Click **Publish Repository**.

Done. Your code is on GitHub. To save future changes: make edits → Commit →
**Push origin**.

---

## Option 2 — Command line (if you prefer)

Open a terminal **in the `integrated` folder** and run these lines one at a
time:

```
git init
git add .
git status
```

Look at the `git status` output and **confirm `.env` is NOT listed** (it should
be ignored). Then:

```
git commit -m "Initial commit"
git branch -M main
```

Now create an **empty** private repo on github.com (the "+" top-right → New
repository → name `energy-tech-crane` → Private → **do NOT** add a README or
.gitignore, since we already have them → Create). GitHub shows you a URL like
`https://github.com/yourname/energy-tech-crane.git`. Use it here:

```
git remote add origin https://github.com/yourname/energy-tech-crane.git
git push -u origin main
```

Enter your GitHub username and a **Personal Access Token** as the password
(GitHub → Settings → Developer settings → Personal access tokens → generate one
with "repo" scope). Done.

---

## ⚠️ One-time safety check

If at any earlier point a real `.env` file (with your real database password or
`APP_SECRET`) was ever committed, it stays in git history forever even after you
delete it. If that happened:

1. Rotate the secrets: change the DB password in hPanel and generate a new
   `APP_SECRET`.
2. Update your live `erp-server/.env` with the new values and restart the app.

If you followed this guide from a clean start, you're fine — `.env` was never
added.

---

## Saving updates later

Whenever you change files (or I send you a new version you drop in):

**GitHub Desktop:** the changed files appear automatically → write a short
summary → **Commit to main** → **Push origin**.

**Command line:**
```
git add .
git commit -m "describe what changed"
git push
```

---

## Deploying FROM GitHub to Hostinger (optional, advanced)

Once the repo exists, you can pull updates on the server instead of uploading
zips. In the Hostinger Terminal, in your project folder, the first time:

```
git clone https://github.com/yourname/energy-tech-crane.git .
```

After that, to get the latest version any time:

```
git pull
npm install
```

then **Restart** the Node app in hPanel. (Your `erp-server/.env` stays put —
git ignores it, so `git pull` never touches your live config.)
