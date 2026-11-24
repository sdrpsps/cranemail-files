<img src="public/brand/crane.svg" alt="" width="56" height="56">

# CraneMail Files

[简体中文](./README.zh-CN.md) · English

**Upload a file. Copy a link. Share it anywhere.**

CraneMail Files turns your CraneMail workspace storage into a file-sharing library. Upload images and documents from your browser or Telegram, then copy a short link or a ready-to-paste Markdown snippet.

Files stay in your CraneMail workspace. You can deploy this app on your own domain to manage uploads and share links.

<!-- Add a screenshot of the web dashboard here. -->

## What you can do

| You want to… | CraneMail Files helps you… |
| --- | --- |
| Share a screenshot or document | Drag in files, choose several at once, or paste files from the clipboard. |
| Add an image to a post or README | Copy a short link or Markdown directly from the file library. |
| Upload from your phone | Send photos and documents to your linked Telegram bot. |
| Find something you uploaded earlier | Search by filename, filter by upload source, and switch between grid and list views. |
| Bring existing workspace files into the library | Sync your configured sharing folder without uploading the files again. |
| Tidy up your storage | Delete unwanted files and clean up empty date folders. |

You need a CraneMail account with workspace file storage. This project is developed and tested with CraneMail; compatibility with other SmarterMail services is not guaranteed.

Need an account? You can use the maintainer's [NameCrane referral link](https://namecrane.com/r/434/email).

## Upload and share

### Share your first file

1. Open the deployed site and sign in with your CraneMail email or username and password. Expand **Server Endpoint** if you use a different CraneMail server.
2. Drop files into the upload area, choose files, or paste a screenshot from your clipboard.
3. Wait for the upload to finish, then choose **Copy Link**.
4. Send the link to someone, or choose **Copy Markdown** to use it in a document.

**Copy Link** uses an app short link such as `https://files.example.com/s/abc1234`. **Copy Original Link** gives you the underlying CraneMail storage URL. Recipients do not need to sign in to this app to open a public link.

Files are saved under the configured sharing folder, grouped by date, for example `/public/2026/11/24`. They use your CraneMail storage quota.

### Use files already in your workspace

Choose **Sync Workspace** in the file library to scan the configured `PUBLIC_FOLDER` and its subfolders. New files are added to the library, with public links generated where needed.

**Sync can publish previously unshared files in that folder.** Use a dedicated sharing folder and keep private files elsewhere.

Search and source filters help you find files uploaded from the web, Telegram, or workspace sync. Image files also have a larger preview.

### Upload with Telegram

If the site operator has configured a bot:

1. Choose **Link Telegram** on the dashboard.
2. Enter your CraneMail password to generate a binding link.
3. Open the bot link and press **Start**, or send the displayed `/start <token>` command. The token expires after 10 minutes.
4. Send a photo or document. The bot replies with a short link and the original storage link.

Use `/files`, `/list`, or **📂 My Files** to browse your files; use `/help` for help. Send an image as a document when you want to preserve the original file.

### Understand public links and deletion

- Treat both short links and original links as public: anyone with the link can access the shared file. This app does not add passwords or expiry dates to links.
- **Delete removes the actual file from CraneMail**, as well as its library record. It is not just a “hide from library” action, and this app cannot undo it.
- Short links depend on this app, its domain, and its database. Keep the database when moving or upgrading a deployment.
- After deletion, an existing short-link redirect can remain cached for up to 60 seconds in browsers or 300 seconds in shared caches. Deleting a file does not recall copies someone has already downloaded.

## Deploy your own instance

You need Node.js **20.9 or newer**, pnpm, and a CraneMail account with workspace storage. Telegram integration is optional.

For a persistent Node server, you can use local SQLite. For Vercel or another host without a persistent writable filesystem, configure a remote Turso/libSQL database.

### 1. Install and configure

Clone or download this repository, open its directory, and run:

```bash
pnpm install
cp .env.example .env.local
openssl rand -hex 32
```

Put the generated value in `ENCRYPTION_KEY`. For a local trial, the essential settings are:

```env
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_SMARTERMAIL_URL=https://us1.workspace.org
PUBLIC_FOLDER=/public
TIMEZONE=Asia/Shanghai
ENCRYPTION_KEY=replace-with-your-generated-key
```

For a public deployment, set `NEXT_PUBLIC_SITE_URL` to your HTTPS domain **before building**, for example `https://files.example.com`. It controls short links, canonical URLs, social previews, and the sitemap. Use the domain root without a path, query string, or fragment. Rebuild after changing it.

### 2. Initialize the database and start

```bash
pnpm db:migrate
pnpm dev
```

Open [localhost:3000](http://localhost:3000), sign in, and upload a small file.

For a production Node server:

```bash
pnpm db:migrate
pnpm build
pnpm start
```

Keep `local.db` on persistent storage if you use SQLite. Run migrations before starting a new application version; the app checks database readiness and does not create or upgrade tables on incoming requests.

### Deploy to Vercel

1. Create a Turso database and obtain its URL and access token.
2. Import your repository into Vercel as a Next.js project.
3. Add the environment variables below to the appropriate deployment environment, including your public domain, a stable encryption key, and the Turso credentials.
4. Use `pnpm install --frozen-lockfile` as the install command and `pnpm db:migrate && pnpm build` as the build command.
5. Deploy, then test sign-in, a small upload, and the copied share link.

Do not use the `local.db` fallback on Vercel. Use separate databases for production and preview deployments: the migration command targets whichever database is configured.

For upload-size and execution limits, check your [hosting plan's limits](https://vercel.com/docs/functions/limitations). This app sends browser uploads through its server, so your host and CraneMail account both affect which files can be uploaded.

### Configuration reference

| Variable | What to set |
| --- | --- |
| `NEXT_PUBLIC_SITE_URL` | Public app origin. Defaults to `http://localhost:3000` when empty. Set before building. |
| `NEXT_PUBLIC_SMARTERMAIL_URL` | Default CraneMail server, such as `https://us1.workspace.org`. Users can change the server at sign-in. |
| `PUBLIC_FOLDER` | Folder used for uploads and workspace sync; defaults to `/public`. Use a dedicated sharing folder. |
| `TIMEZONE` | Timezone for date folders and bot timestamps; defaults to `Asia/Shanghai`. |
| `ENCRYPTION_KEY` | A long, private, stable value. Generate one with `openssl rand -hex 32`; replace the example development key. |
| `TURSO_DATABASE_URL` | Remote libSQL URL, or leave empty to use `local.db` on a persistent server. |
| `TURSO_AUTH_TOKEN` | Access token for the remote database, when required. |
| `TELEGRAM_BOT_TOKEN` | Optional bot token from [@BotFather](https://t.me/BotFather). |
| `TELEGRAM_BOT_USERNAME` | Your bot's username without `@`; used to create binding links. |
| `ALLOWED_TELEGRAM_USERS` | Optional comma-separated Telegram user IDs or usernames without `@`. Empty allows any Telegram user to bind their own CraneMail account. |
| `SMARTERMAIL_CLIENT_ID` | Authentication client identifier; normally keep `cranemail-files-app`. |

The app stores encrypted CraneMail passwords and session tokens on the server so it can renew sessions. The browser uses an HttpOnly app session cookie. Deploy only on a server you trust, keep credentials private, and back up the database together with `ENCRYPTION_KEY`. Changing that key makes existing encrypted credentials unreadable; users will need to sign in again and may need to relink Telegram.

### Enable your Telegram bot

Create a bot through [@BotFather](https://t.me/BotFather), configure `TELEGRAM_BOT_TOKEN` and `TELEGRAM_BOT_USERNAME`, and redeploy. Your public HTTPS endpoint is:

```text
https://files.example.com/api/telegram/webhook
```

Export your actual bot token in the terminal, then register and verify the webhook. Replace the example domain with your deployment:

```bash
export TELEGRAM_BOT_TOKEN='your-bot-token'
curl --fail-with-body --request POST \
  --data-urlencode 'url=https://files.example.com/api/telegram/webhook' \
  "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook"
curl --fail-with-body \
  "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo"
```

Check that `result.url` matches your deployment and that `last_error_message` does not report a delivery problem. Then follow the [binding steps](#upload-with-telegram).

For local bot development, use `pnpm dev:bot`. **This deletes the bot's active webhook** to enable polling, so use a separate development bot or register the production webhook again afterward.

## Common questions

**Do I need Telegram or Turso to try this?**

No. Start locally with SQLite and browser uploads. Add Telegram when you need mobile uploads; add a remote database when your hosting environment requires one.

**Why are existing workspace files missing?**

Choose **Sync Workspace**, and check that the files are under the configured `PUBLIC_FOLDER`. Refreshing the library only reloads files already recorded by this app.

**Why do short links use localhost or an old domain?**

Correct `NEXT_PUBLIC_SITE_URL`, rebuild, and redeploy. Keep the old domain working if you need previously shared links to continue working.

**Why does an upload fail?**

Try a small file first. Check your CraneMail storage quota and sharing permissions, then your host's request-size and execution limits. For bot uploads, check the server logs for Telegram download or CraneMail upload errors.

**Why does Telegram not respond, or reject a binding token?**

Check the bot token, allowed-user list, and `getWebhookInfo`. Generate a fresh binding link within its 10-minute window. The web app and webhook must use the same database. If you ran `pnpm dev:bot`, restore the webhook.

**Why does the app say “Database is not ready”?**

Run `pnpm db:migrate` against the database used by the deployment. Check the database URL and token; restarting the app alone does not apply migrations.

**What appears in search engines and social previews?**

The public home page has a canonical URL and a branded social card. The sitemap includes only that page on a configured public deployment. The dashboard, API responses, and file short links carry `noindex` directives; localhost and Vercel preview builds are also marked `noindex`. These directives guide compliant crawlers and are not access controls.

## Contributing and development

The app uses Next.js App Router, React, Hono, Drizzle/libSQL, shadcn/ui, and Tailwind CSS.

```bash
pnpm lint
pnpm exec tsc --noEmit
pnpm test
```

For database changes, update `lib/db/schema.ts`, run `pnpm db:generate`, review the generated migration, and apply it with `pnpm db:migrate`. `pnpm db:studio` opens the database browser.

Brand assets and the editable social-card SVG live in [`public/brand`](./public/brand). Site metadata is defined in [`lib/site.ts`](./lib/site.ts).
