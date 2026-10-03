# Day's End: setup guide

Day's End is a private nightly journal that runs as a web page. It needs no Claude account and no server.
Each person's entries stay in their own browser. If you switch on Google Doc sync, each person can also
keep a copy in a Google Doc in their own Drive.

The app works fully after step 1. Steps 2 and 3 are only for Google Doc sync, and you do them once for the whole family.

## Step 1. Put the app online (about 5 minutes)

The folder is plain files, so any free static host works. Two easy options:

**Netlify (simplest)**
1. Create a free account at netlify.com.
2. Open app.netlify.com/drop and drag the whole `days-end-app` folder onto the page.
3. You get an address like `https://something.netlify.app`. Rename it under Site settings if you want a friendlier one.

**GitHub Pages**
1. Create a free GitHub account and a new public repository.
2. Upload the files in this folder.
3. In the repository, open Settings > Pages and publish from the main branch. The address is shown there.

Send that address to your children. On a phone they open it and add it to the home screen
(iPhone: Safari Share button > Add to Home Screen. Android: Chrome menu > Install app).
Installing matters on iPhone: Safari clears a normal web page's saved data after about a week of not opening it, and an installed app is exempt.

## Step 2. Create a Google sign-in key (about 10 minutes, only for Google Doc sync)

1. Go to console.cloud.google.com and create a project, for example "Days End".
2. APIs and services > Library: search for **Google Docs API** and click Enable.
3. APIs and services > OAuth consent screen (or Google Auth Platform):
   - User type: **External**.
   - App name "Day's End", your email as support and developer contact.
   - Scopes: add `https://www.googleapis.com/auth/drive.file` (listed as "See, edit, create and delete only the specific Google Drive files you use with this app"). It is the only scope the app asks for.
   - Click **Publish app** so the status is "In production". While it says "Testing", only listed test users can sign in and their permission expires after 7 days.
4. APIs and services > Credentials > Create credentials > **OAuth client ID**:
   - Application type: **Web application**.
   - Authorized JavaScript origins: your app address from step 1, for example `https://something.netlify.app` (no trailing slash, no path).
   - You do not need a redirect URI.
5. Copy the **Client ID**. It ends in `.apps.googleusercontent.com`. It is not a secret.

## Step 3. Turn sync on

1. Open `config.js` in a text editor and paste the client ID between the quotes after `GOOGLE_CLIENT_ID:`.
2. Upload the folder again (Netlify: Deploys > drag the folder onto the deploy area. GitHub: replace `config.js`).
3. In `sw.js`, change `dayend-v1` to `dayend-v2` before you upload so phones pick up the new files. Do this every time you change any file.

Each person then opens the app > Settings > **Connect a Google Doc**, signs in with their own Google account,
and approves. The app creates one doc called "Day's End Journal" in that person's Drive.

## How the Google Doc behaves

- One heading per day, in date order. Saving a day again replaces that day's section, so there are no duplicates.
- Google only lets a web page stay signed in for about an hour. Entries are always saved on the device first.
  If the sign-in has lapsed, the Today screen shows "N entries waiting, tap to sync". One tap sends them.
  While signed in, edits are sent a few seconds after you stop typing.
- The sync is one-way. Change entries in the app, not in the doc. Anything typed into the doc below the last day's entry is overwritten the next time that day is saved.
- The app can only see the doc it created. It cannot read the rest of that person's Drive.
- If the doc is deleted, Settings offers "Start a new doc".

## Things to know

- **Privacy:** there is no account system and no server. You, the person who hosts the files, cannot see anyone's entries.
- **Lost data:** if someone clears their browser data or changes phone, entries on the device are gone unless they synced to the doc or saved a backup file (Settings > Backup).
- **Children's accounts:** Google accounts managed through Family Link or a school can block sign-in to apps outside their approved list. If sign-in fails, the app still works without Google Doc sync.
- **Updating the app:** edit the files, bump the version in `sw.js`, upload again.

## Files

| File | Purpose |
|---|---|
| `index.html` | The app |
| `docsync.js` | Google Doc sync |
| `config.js` | The one setting you edit |
| `sw.js` | Makes the app work offline |
| `manifest.webmanifest`, `*.png` | Home screen name and icons |
