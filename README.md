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

1. Open **Telegram Bots** on the dashboard. Paste a bot token from BotFather and choose **Connect bot**. The server validates the bot, encrypts the token, and registers a webhook with a unique secret. All bots are configured on the dashboard.
2. Choose **Link account** for that bot and verify the current CraneMail account password to generate a 10-minute binding link.
3. Open the link and press **Start**, or send `/start <token>` in the bot's private chat. Return to the website to check the binding status.
4. Send a photo or document. The bot replies with the destination email, short link, and original storage link. Send images as documents to preserve the original file.

To link several CraneMail accounts to the same bot, sign in to each account, add the same bot token, and complete linking. Adding an account preserves existing bindings and the current upload destination. Use `/accounts` or **👤 Accounts** in Telegram to choose the account for subsequent uploads and file lists. Selections are isolated by bot and Telegram user.

Use `/files`, `/list`, or **📂 My Files** to list the current account's files. Existing pagination buttons retain their original account. Uploads keep the account selected when they began, even if you switch while a file is downloading. Disconnecting a bot on the website removes only the current CraneMail account's configuration and bindings. If the selected account is disconnected, explicitly choose another in Telegram.

Use `/search <filename>` to find files in the selected account by part of their name.

### Understand public links and deletion

- Treat both short links and original links as public: anyone with the link can access the shared file. This app does not add passwords or expiry dates to links.
- **Delete removes the actual file from CraneMail**, as well as its library record. It is not just a “hide from library” action, and this app cannot undo it.
- Short links depend on this app, its domain, and its database. Keep the database when moving or upgrading a deployment.
- After deletion, an existing short-link redirect can remain cached for up to 60 seconds in browsers or 300 seconds in shared caches. Deleting a file does not recall copies someone has already downloaded.

## Deploy your own instance

You need Node.js **24**, pnpm, a Cloudflare account for Workers and D1, and a CraneMail account with workspace storage. Telegram integration is optional.

### 1. Install and configure

Clone or download this repository, open its directory, and run:

```bash
pnpm install --frozen-lockfile
cp .dev.vars.example .dev.vars
openssl rand -hex 32
```

Put the generated value in `ENCRYPTION_KEY`. Run `openssl rand -hex 32` again to generate a separate value for `BETTER_AUTH_SECRET`.

Default deployment settings come from `vars` in `wrangler.jsonc`, and `secrets.required` lists the secret names. Put your local secret values—plus local overrides for `NEXT_PUBLIC_SITE_URL` and `BETTER_AUTH_URL` (e.g., `http://localhost:8787`)—in the Git-ignored `.dev.vars` file. The local Workers build and dev server need no `.env` or `.env.local` file.

For a public deployment, set `NEXT_PUBLIC_SITE_URL` under `vars` in `wrangler.jsonc` to your HTTPS domain, such as `https://files.example.com`. It controls short links, canonical URLs, social previews, and the sitemap. Use the domain root without a path, query string, or fragment. Rebuild after changing it.

### 2. Initialize the database and start

```bash
pnpm db:migrate
pnpm dev
```

Open [localhost:8787](http://localhost:8787), sign in, and upload a small file. The dev server uses Wrangler's local D1 database and `.dev.vars` via `initOpenNextCloudflareForDev()` with instant HMR.

### Share a Cloudflare Worker Preview

`pnpm preview` builds the app and runs `wrangler preview` for the same Worker as production. Wrangler uses the current Git branch as the Preview name by default. Cloudflare returns a stable URL for the branch and a URL for the specific deployment. Use the stable URL for signing in and testing short links.

1. In the Worker's **Domains** tab, turn on **Preview** under **Worker URL** to enable its `workers.dev` Preview URLs. These URLs are public by default. Use Cloudflare Access if the Preview needs restricted access. [Cloudflare routing and access](https://developers.cloudflare.com/workers/previews/custom-domains/)
2. Create a separate D1 database with `pnpm exec wrangler d1 create cranemail-files-preview --update-config=false`. Fill in its UUID under `previews.d1_databases` in `wrangler.jsonc` and under `d1_databases` in `wrangler.preview-migrations.jsonc`. Run `pnpm exec wrangler d1 migrations apply PREVIEW_DB --remote --config wrangler.preview-migrations.jsonc` before deploying. Branches that use the same Preview D1 ID share data and schema changes. For an isolated branch, use a separate database in both files. [Cloudflare D1 migration guidance](https://developers.cloudflare.com/workers/previews/resources/#d1-migrations)
3. On the first deployment, pass `--secrets-file` with a private JSON file outside the repository containing independent values for `BETTER_AUTH_SECRET` and `ENCRYPTION_KEY`, or set these as Previews Base secrets in Cloudflare. [Cloudflare Preview secrets](https://developers.cloudflare.com/workers/previews/configuration/#secrets)

For example, if the Preview is named `feature-login` and the Cloudflare account's Workers subdomain is `my-team`, run the following. Replace the example hostname and secret file path with your own values.

```bash
PREVIEW_ORIGIN=https://feature-login-cranemail-files.my-team.workers.dev \
  pnpm preview --name feature-login --secrets-file /path/to/preview-secrets.json
```

Use a test CraneMail account and a separate test bot for write tests, since uploads and webhook changes still reach those external services.

### Deploy to Cloudflare Workers

1. Run `pnpm exec wrangler login` and create a D1 database in your Cloudflare account. In `wrangler.jsonc`, set your Worker name and D1 database ID, keeping the binding named `DB`.
2. Set the public HTTPS origin in `wrangler.jsonc` under `vars`, then run `pnpm bundle`. The config lists the two required secret names under `secrets.required`.
3. Run `pnpm db:migrate:remote` (`wrangler d1 migrations apply DB --remote`) to migrate your production D1.
4. Configure your custom domain in the Cloudflare dashboard or config. Run `pnpm cf:deploy` (which runs remote D1 migrations followed by `wrangler deploy`; in Workers Builds, set the build command to `pnpm bundle` and the deploy command to `pnpm cf:deploy`) to reuse the existing Worker secrets. On the first deploy of a new Worker, use `pnpm exec wrangler deploy --secrets-file /path/to/production-secrets.json` and provide both values in that private JSON file outside the repository. Check sign-in, a small upload, and its short link.

The browser sends file bytes to the Worker, which streams them into a CraneMail multipart upload. File sizes depend on the [Workers request limits](https://developers.cloudflare.com/workers/platform/limits/) and the CraneMail account's limits.

### Configuration reference

| Variable | What to set |
| --- | --- |
| `NEXT_PUBLIC_SITE_URL` | Public app origin. Set before building. |
| `NEXT_PUBLIC_DISABLE_INDEXING` | Set to `1` in hosted preview builds. |
| `NEXT_PUBLIC_SMARTERMAIL_URL` | Default CraneMail server, such as `https://us1.workspace.org`. Users can change the server at sign-in. |
| `PUBLIC_FOLDER` | Folder used for uploads and workspace sync; defaults to `/public`. Use a dedicated sharing folder. |
| `TIMEZONE` | Timezone for date folders and bot timestamps; defaults to `Asia/Shanghai`. |
| `ENCRYPTION_KEY` | A long, private, stable value. Generate one with `openssl rand -hex 32`. |
| `BETTER_AUTH_SECRET` | A private, stable session signing secret. Generate a separate value with `openssl rand -hex 32`. |
| `BETTER_AUTH_URL` | Optional origin override for authentication. Defaults to `NEXT_PUBLIC_SITE_URL`. Set it to the URL users open if it differs, such as on a preview deployment. |
| `UPLOAD_MAX_BYTES` | Optional application upload limit in bytes. |
| `SMARTERMAIL_CLIENT_ID` | Authentication client identifier; normally keep `cranemail-files-app`. |

Better Auth manages the app session through a signed HttpOnly cookie that expires 30 days after sign-in. The dashboard reads the current account and file list from the app database. Sign-in and Telegram linking verify credentials with CraneMail. The server stores encrypted CraneMail credentials to renew access for workspace operations such as uploading, syncing, deleting files, and cleaning empty folders. If CraneMail is unavailable or rejects a file operation, the app session remains valid. Signing out revokes that browser's app session.

Deploy only on a server you trust, keep credentials private, and back up the database together with `ENCRYPTION_KEY`. Changing that key makes existing encrypted credentials unreadable. Users will need to sign in again to restore workspace access and may need to relink Telegram.

### Enable your Telegram bot

Set `NEXT_PUBLIC_SITE_URL` to the public HTTPS origin and keep a stable `ENCRYPTION_KEY`.

Add your BotFather token in **Telegram Bots** on the dashboard. Each bot receives updates at:

```text
https://files.example.com/api/telegram/webhook/<bot-id>
```

The app uses grammY for message handling and Bot API calls. Connecting a bot registers its private-chat command menu. To refresh the menu for an existing bot, submit the same token again in **Telegram Bots**. The connection subscribes to messages and callback queries and authenticates webhooks using the `X-Telegram-Bot-Api-Secret-Token` header. Completed updates are deduplicated; transient processing failures return a non-2xx response for Telegram to retry. Upload business errors are reported to the user, who can resend the file.

A Telegram bot has one webhook. Connecting it here replaces its previous webhook, so use a dedicated bot. Tokens are encrypted and never returned by the list API. Multiple CraneMail accounts adding the same token share the bot record and webhook, while each Telegram user can access only accounts they have linked.

## Common questions

**Do I need a Cloudflare account to try this locally?**

Wrangler provides local D1 for the preview. A Cloudflare account is needed for a hosted deployment. Telegram is optional.

**Why are existing workspace files missing?**

Choose **Sync Workspace**, and check that the files are under the configured `PUBLIC_FOLDER`. Refreshing the library only reloads files already recorded by this app.

**Why do short links use localhost or an old domain?**

Correct `NEXT_PUBLIC_SITE_URL`, rebuild, and redeploy. Keep the old domain working if you need previously shared links to continue working.

**Why does an upload fail?**

Try a small file first. Check your CraneMail storage quota and sharing permissions, then your host's request-size and execution limits. For bot uploads, check the server logs for Telegram download or CraneMail upload errors.

**Why does Telegram not respond, or reject a binding token?**

Check the bot token and `getWebhookInfo`. Generate a fresh binding link within its 10-minute window. The web app and webhook must use the same database.

**Why does the app say “Database is not ready”?**

Run the D1 migration command using the Wrangler configuration for that deployment, and check its `DB` binding.

**What appears in search engines and social previews?**

The public home page has a canonical URL and a branded social card. The sitemap includes only that page on a configured public deployment. The dashboard, API responses, short links, and configured preview builds carry `noindex` directives.

## Contributing and development

The app uses Next.js App Router, OpenNext, Hono, Drizzle D1, shadcn/ui, and Tailwind CSS.

```bash
pnpm lint
pnpm exec tsc --noEmit
pnpm test
```

For database changes, update `lib/db/schema.ts`, run `pnpm db:generate`, review the generated migration, and apply it locally with `pnpm db:migrate`.

Brand assets and the editable social-card SVG live in [`public/brand`](./public/brand). Site metadata is defined in [`lib/site.ts`](./lib/site.ts).
