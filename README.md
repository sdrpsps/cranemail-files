# CraneMail Images

[简体中文](./README.zh-CN.md)

A focused image-hosting dashboard for CraneMail workspace storage. It uploads images into a configured CraneMail workspace folder, publishes public links, syncs existing workspace images, and supports Telegram bot uploads for linked users.

Need an email workspace for this project? You can sign up through the NameCrane referral link: [namecrane.com/r/434/email](https://namecrane.com/r/434/email).

Compatibility note: this project is developed and tested against CraneMail, but compatibility with other SmarterMail deployments is not guaranteed.

## Features

- Sign in with a CraneMail account and maintain sessions with access/refresh token cookies.
- Upload images from the web dashboard to CraneMail workspace storage.
- Generate public links automatically after upload.
- Sync existing workspace images under `PUBLIC_FOLDER`.
- Delete the real CraneMail workspace file first, then remove the local record.
- Bind Telegram accounts through temporary tokens generated from the web dashboard.
- Upload photos and documents through the Telegram bot.
- List recent uploads from the Telegram bot.
- Use local SQLite in development and Turso/libSQL in production.
- Frontend built with Next.js App Router, shadcn/ui, Tailwind CSS, lucide-react, and sonner.

## Tech Stack

- Next.js 16
- React 19
- Hono API routes on Next.js
- libSQL/Turso or local SQLite
- shadcn/ui with Base UI primitives
- Tailwind CSS v4
- Telegram Bot API

## Requirements

- Node.js 20 or newer
- npm
- A CraneMail workspace account with file storage access
- Optional: Telegram bot token from BotFather
- Optional: Turso database credentials for hosted deployments

## Setup

Install dependencies:

```bash
npm install
```

Create a local environment file:

```bash
cp .env.example .env.local
```

Configure the required values in `.env.local`:

```env
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_SMARTERMAIL_URL=https://us1.workspace.org
SMARTERMAIL_CLIENT_ID=cranemail-images-app
PUBLIC_FOLDER=/public
TIMEZONE=Asia/Shanghai

ENCRYPTION_KEY=replace-with-a-secure-random-secret

TELEGRAM_BOT_TOKEN=
TELEGRAM_BOT_USERNAME=CraneMailImagesBot

TURSO_DATABASE_URL=
TURSO_AUTH_TOKEN=
```

Use a long random value for `ENCRYPTION_KEY`. For example:

```bash
openssl rand -hex 32
```

## Environment Variables

`NEXT_PUBLIC_SITE_URL`

Public site origin used for SEO metadata, canonical URLs, and Open Graph metadata.

`NEXT_PUBLIC_SMARTERMAIL_URL`

Base URL for your CraneMail workspace service. Do not include a trailing slash.

`SMARTERMAIL_CLIENT_ID`

Client identifier sent to the CraneMail/SmarterMail-compatible authentication endpoints.

`PUBLIC_FOLDER`

Workspace folder root used for uploads and sync. Both `public` and `/public` are valid. The app normalizes it to a leading slash and removes trailing slashes.

`TIMEZONE`

Timezone used for date-based upload folders and bot date formatting.

`ENCRYPTION_KEY`

Secret used to encrypt stored CraneMail passwords for Telegram bot re-authentication fallback.

`TELEGRAM_BOT_TOKEN`

Telegram bot token. Required only for bot upload and binding flows.

`TELEGRAM_BOT_USERNAME`

Telegram bot username used to generate binding links.

`ALLOWED_TELEGRAM_USERS`

Optional comma-separated Telegram user IDs or usernames. When set, only listed users may use the bot.

`TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`

Optional libSQL/Turso database settings. If `TURSO_DATABASE_URL` is empty, the app writes to `local.db` in the project root.

## Development

Run the development server:

```bash
npm run dev
```

Run the Telegram bot locally in polling mode for debugging:

```bash
npm run dev:bot
```

`dev:bot` loads `.env.local`, requires `TELEGRAM_BOT_TOKEN`, deletes the active Telegram webhook, and then polls `getUpdates`. Use it for local bot debugging only, and re-register the production webhook when you are done.

Open:

```text
http://localhost:3000
```

Main routes:

- `/` - sign-in page
- `/upload` - authenticated upload dashboard
- `/api/*` - Hono API routes

## Build

Build the project:

```bash
npm run build
```

## Deployment

This production flow assumes Vercel for hosting, Turso for the libSQL database, and Telegram Bot API webhooks for bot updates.

### 1. Prepare Production Values

Choose the production domain first. It can be either a Vercel domain or your custom domain:

```text
https://your-domain.example
```

Generate a stable encryption key before the first deployment:

```bash
openssl rand -hex 32
```

Keep this value. Do not rotate `ENCRYPTION_KEY` casually because existing encrypted bot credentials cannot be decrypted after it changes unless users re-bind.

### 2. Create a Turso Database

Open the Turso dashboard:

```text
https://app.turso.tech
```

Create a database from the dashboard:

1. Click `Create Database`.
2. Name it, for example `cranemail-images`.
3. Choose a region close to your Vercel deployment or primary users.
4. Create the database.

Open the database page and copy the database URL. It should look like:

```env
TURSO_DATABASE_URL=libsql://...
```

Then create a database token from the dashboard:

1. Open the database settings or tokens page.
2. Create a new token for the app.
3. Copy the token once it is shown.

Use these values for Vercel:

```env
TURSO_DATABASE_URL=libsql://...
TURSO_AUTH_TOKEN=...
```

The app creates the required `users`, `bind_tokens`, and `uploaded_images` tables automatically on startup. There is no separate migration command.

### 3. Create a Telegram Bot

In Telegram, open `@BotFather` and run:

```text
/newbot
```

Follow BotFather's prompts, then keep:

- Bot token, used as `TELEGRAM_BOT_TOKEN`
- Bot username, used as `TELEGRAM_BOT_USERNAME`

Example:

```env
TELEGRAM_BOT_TOKEN=123456789:...
TELEGRAM_BOT_USERNAME=CraneMailImagesBot
```

If the bot should only work for specific Telegram accounts, set:

```env
ALLOWED_TELEGRAM_USERS=123456789,some_username
```

This value accepts comma-separated Telegram numeric user IDs or usernames.

### 4. Deploy to Vercel

Push the repository to GitHub, then create a Vercel project from that repository.

Use these project settings:

- Framework Preset: `Next.js`
- Install Command: `npm install`
- Build Command: `npm run build`
- Output Directory: leave the Vercel default

Configure these Vercel environment variables for `Production`:

```env
NEXT_PUBLIC_SITE_URL=https://your-domain.example
NEXT_PUBLIC_SMARTERMAIL_URL=https://us1.workspace.org
SMARTERMAIL_CLIENT_ID=cranemail-images-app
PUBLIC_FOLDER=/public
TIMEZONE=Asia/Shanghai

ENCRYPTION_KEY=your-stable-random-secret

TELEGRAM_BOT_TOKEN=123456789:...
TELEGRAM_BOT_USERNAME=CraneMailImagesBot
ALLOWED_TELEGRAM_USERS=

TURSO_DATABASE_URL=libsql://...
TURSO_AUTH_TOKEN=...
```

Redeploy after adding or changing environment variables. Vercel deployments do not automatically pick up environment variable changes made after a deployment has already been built.

Production must use Turso. Do not rely on the local `local.db` fallback on Vercel because serverless filesystem state is not a durable database.

### 5. Register the Telegram Webhook

After the Vercel deployment is live, register the webhook with the production URL:

```bash
curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook?url=https://your-domain.example/api/telegram/webhook"
```

Verify it:

```bash
curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getWebhookInfo"
```

The response should include:

```json
{
  "ok": true,
  "result": {
    "url": "https://your-domain.example/api/telegram/webhook"
  }
}
```

If `url` is empty, points to a local tunnel, points to another deployment, or `last_error_message` reports delivery failures, run `setWebhook` again with the correct production URL.

Important: `npm run dev:bot` deletes the active Telegram webhook before it starts polling with `getUpdates`. After local bot debugging, always re-register the production webhook.

### 6. Verify the Deployment

Open the production site:

```text
https://your-domain.example
```

Then verify the main flows:

1. Sign in with a CraneMail account.
2. Open `/upload`.
3. Upload a small image from the web dashboard.
4. Generate a Telegram binding token.
5. Open the generated Telegram bot link and send `/start <token>`.
6. Confirm the bot replies with a successful binding message.
7. Send a photo to the bot and confirm it returns a CraneMail public link.

In Vercel logs, Telegram activity should show requests to:

```text
POST /api/telegram/webhook
```

### 7. Deployment Troubleshooting

If Telegram binding does nothing:

- Run `getWebhookInfo` and confirm `url` points to the Vercel production endpoint.
- Confirm `TELEGRAM_BOT_TOKEN` is set in Vercel `Production`.
- Confirm you redeployed after changing Vercel environment variables.
- Check Vercel function logs for `POST /api/telegram/webhook`.
- If you ran `npm run dev:bot`, re-run `setWebhook`.

If binding tokens are generated but Telegram says they are invalid:

- Confirm the Vercel app is using the same Turso database that created the `bind_tokens` row.
- Confirm `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` are set in `Production`.
- Generate a fresh binding token; tokens expire after 10 minutes.

If the bot can bind but cannot upload:

- Confirm the user's CraneMail credentials were recently verified through the web binding flow.
- Confirm `PUBLIC_FOLDER` exists or can be created by the app.
- Check Vercel logs for SmarterMail API errors.

## Database

The app initializes these tables automatically:

- `users`
- `bind_tokens`
- `uploaded_images`

Local development uses:

```text
local.db
```

Production should use Turso/libSQL by setting `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`.

## CraneMail Storage Behavior

Web uploads are stored in:

```text
PUBLIC_FOLDER/YYYY/MM/DD
```

For example:

```text
/public/2026/06/15
```

After upload, the app generates a public CraneMail workspace link and stores file metadata in `uploaded_images`.

Workspace sync scans `PUBLIC_FOLDER` recursively and imports image files that are not already present locally by `fileId` or `publicLink`.

Deleting an image from the web dashboard performs a real CraneMail workspace file deletion first. The local database record is removed only after the workspace API reports success.

## Telegram Bot

The bot supports:

- `/start <token>` - bind Telegram to a CraneMail account
- Photo or document upload - upload to CraneMail and return a public link
- `/list`, `/images`, or `📂 My Images / 我的图片` - list recent uploads
- `/help` or `❓ Help / 帮助` - show usage help

To bind a Telegram account:

1. Sign in on the web dashboard.
2. Open the Telegram integration panel.
3. Generate a binding token.
4. Launch the bot from the generated link.
5. Send files or photos to the bot.

The bot stores uploads in the same CraneMail `PUBLIC_FOLDER/YYYY/MM/DD` structure and records metadata in the same `uploaded_images` table.

## Telegram Webhook

Webhook endpoint:

```text
/api/telegram/webhook
```

For a deployed app, register the production webhook with Telegram:

```bash
curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook?url=https://your-domain.example/api/telegram/webhook"
```

Verify that Telegram is pointing to the deployed app:

```bash
curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getWebhookInfo"
```

The `url` field should be your production endpoint:

```text
https://your-domain.example/api/telegram/webhook
```

If `url` is empty, points to another domain, or `last_error_message` reports delivery failures, re-run `setWebhook` with the correct production URL. After using `npm run dev:bot`, you must also re-register the production webhook because the local polling script deletes the active webhook before calling `getUpdates`.

For local development, expose your local server with a tunnel such as ngrok or Cloudflare Tunnel, then register the tunnel URL.

Alternatively, use `npm run dev:bot` to debug the bot with Telegram polling instead of a webhook.

## UI Notes

- Buttons, inputs, cards, alert dialogs, and toaster UI use shadcn/ui components.
- Icons use lucide-react.
- Toast notifications use sonner.
- The `/upload` dashboard is marked `noindex` because it is an authenticated application surface.
- A GitHub referral button is shown in the top-right corner and points to:

```text
https://github.com/sdrpsps/cranemail-images
```

## Current Bot Limitation

The Telegram bot can upload and list images, but it does not yet expose a delete command or inline delete buttons. File deletion is currently available from the web dashboard.

## Security Notes

- Use HTTPS in production.
- Keep `ENCRYPTION_KEY`, `TELEGRAM_BOT_TOKEN`, and Turso credentials private.
- Use `ALLOWED_TELEGRAM_USERS` when the bot should be restricted to specific Telegram accounts.
- Rotate `ENCRYPTION_KEY` carefully. Existing encrypted passwords cannot be decrypted after changing it unless you migrate or rebind users.
- CraneMail workspace file deletion is destructive and cannot be undone by this app.
