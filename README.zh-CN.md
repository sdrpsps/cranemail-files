# CraneMail Files

[English](./README.md)

CraneMail Files 是一个面向 CraneMail workspace 存储的轻量文件分享面板。它可以把文件上传到指定的 CraneMail workspace 文件夹，生成公开链接，同步 workspace 中已有文件，并支持已绑定用户通过 Telegram bot 上传文件。

需要为这个项目准备邮箱 workspace？可以通过我的 NameCrane [推荐链接注册](https://namecrane.com/r/434/email)。

兼容性说明：本项目基于 CraneMail 开发和测试，但不保证兼容其他 SmarterMail 实例。

![preview](https://us1.workspace.org/d/v2/yaikbaKQV0odeVqFeJ1su6GLxtf2aX-x/CGVW72X7M01V)

## 功能

- 使用 CraneMail 账号登录，浏览器只保存应用自己的 session cookie，SmarterMail token 会加密保存在服务端。
- 支持从 Web 页面上传文件到 CraneMail workspace 存储。
- 上传后自动生成公开访问链接。
- 支持同步 `PUBLIC_FOLDER` 下已有的 workspace 文件。
- Web 端删除文件时会先真正删除 CraneMail workspace 文件，再清理本地记录。
- 支持通过 Web 端临时 token 绑定 Telegram 账号。
- Telegram bot 支持上传照片和文档。
- Telegram bot 支持查看最近上传文件。
- 开发环境可使用本地 SQLite，生产环境可使用 Turso/libSQL。
- 前端基于 Next.js App Router、shadcn/ui、Tailwind CSS、lucide-react 和 sonner。

## 技术栈

- Next.js 16
- React 19
- 基于 Next.js 的 Hono API routes
- libSQL/Turso 或本地 SQLite
- shadcn/ui with Base UI primitives
- Tailwind CSS v4
- Telegram Bot API

## 环境要求

- Node.js 20 或更新版本
- npm
- 一个可访问文件存储的 CraneMail workspace 账号
- 可选：从 BotFather 获取 Telegram bot token
- 可选：用于部署环境的 Turso 数据库凭据

## 安装

安装依赖：

```bash
npm install
```

创建本地环境变量文件：

```bash
cp .env.example .env.local
```

在 `.env.local` 中配置必要变量：

```env
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_SMARTERMAIL_URL=https://us1.workspace.org
SMARTERMAIL_CLIENT_ID=cranemail-files-app
PUBLIC_FOLDER=/public
TIMEZONE=Asia/Shanghai

ENCRYPTION_KEY=replace-with-a-secure-random-secret

TELEGRAM_BOT_TOKEN=
TELEGRAM_BOT_USERNAME=CraneMailFilesBot

TURSO_DATABASE_URL=
TURSO_AUTH_TOKEN=
```

`ENCRYPTION_KEY` 应使用足够长的随机值。例如：

```bash
openssl rand -hex 32
```

## 环境变量

`NEXT_PUBLIC_SITE_URL`

用于 SEO metadata、canonical URL 和 Open Graph metadata 的公开站点地址。

`NEXT_PUBLIC_SMARTERMAIL_URL`

CraneMail workspace 服务基础 URL。建议不要带结尾斜杠。

`SMARTERMAIL_CLIENT_ID`

发送给 CraneMail/SmarterMail-compatible 认证接口的 client identifier。

`PUBLIC_FOLDER`

用于上传和同步的 workspace 根目录。`public` 和 `/public` 都有效，应用会自动补齐开头斜杠并移除结尾斜杠。

`TIMEZONE`

用于按日期生成上传目录，以及 Telegram bot 中的日期格式化。

`ENCRYPTION_KEY`

用于加密存储的 CraneMail 密码，供 Telegram bot 在 refresh token 失效时重新认证。

`TELEGRAM_BOT_TOKEN`

Telegram bot token。只有在需要 bot 上传和绑定功能时才必须配置。

`TELEGRAM_BOT_USERNAME`

用于生成 Telegram 绑定链接的 bot 用户名。

`ALLOWED_TELEGRAM_USERS`

可选，逗号分隔的 Telegram user ID 或 username。配置后只有列表中的用户可以使用 bot。

`TURSO_DATABASE_URL` 和 `TURSO_AUTH_TOKEN`

可选的 libSQL/Turso 数据库配置。如果 `TURSO_DATABASE_URL` 为空，应用会在项目根目录写入 `local.db`。

## 本地开发

启动开发服务器：

```bash
npm run dev
```

本地用 polling 模式调试 Telegram bot：

```bash
npm run dev:bot
```

`dev:bot` 会读取 `.env.local`，需要配置 `TELEGRAM_BOT_TOKEN`，启动时会删除当前 Telegram webhook，然后通过 `getUpdates` 轮询消息。它只适合本地调试 bot；调试结束后需要重新注册生产环境 webhook。

打开：

```text
http://localhost:3000
```

主要路由：

- `/` - 登录页
- `/upload` - 已认证上传面板
- `/api/*` - Hono API routes

## 构建

正常构建：

```bash
npm run build
```

## 部署流程

以下生产部署流程默认使用 Vercel 托管应用、Turso 作为 libSQL 数据库，并通过 Telegram Bot API webhook 接收 bot 消息。

### 1. 准备生产环境参数

先确定生产环境域名。可以使用 Vercel 默认域名，也可以使用自定义域名：

```text
https://your-domain.example
```

首次部署前生成一个稳定的加密密钥：

```bash
openssl rand -hex 32
```

请保存好这个值。不要随意轮换 `ENCRYPTION_KEY`，因为它变更后，已有的 bot 加密凭据将无法解密，除非用户重新绑定。

### 2. 创建 Turso 数据库

打开 Turso Dashboard：

```text
https://app.turso.tech
```

在 Dashboard 中创建数据库：

1. 点击 `Create Database`。
2. 填写数据库名称，例如 `cranemail-files`。
3. 选择靠近 Vercel 部署区域或主要用户的 region。
4. 创建数据库。

打开数据库页面并复制 database URL，格式类似：

```env
TURSO_DATABASE_URL=libsql://...
```

然后在 Dashboard 中创建 database token：

1. 打开该数据库的 settings 或 tokens 页面。
2. 为应用创建一个新的 token。
3. token 显示后立即复制保存。

把这两个值配置到 Vercel：

```env
TURSO_DATABASE_URL=libsql://...
TURSO_AUTH_TOKEN=...
```

应用启动时会自动创建所需的 `users`、`app_sessions`、`smartermail_sessions`、`bind_tokens` 和 `uploaded_files` 表，不需要单独执行 migration 命令。

### 3. 创建 Telegram Bot

在 Telegram 中打开 `@BotFather`，执行：

```text
/newbot
```

按 BotFather 提示创建 bot，然后保存：

- Bot token，对应 `TELEGRAM_BOT_TOKEN`
- Bot username，对应 `TELEGRAM_BOT_USERNAME`

例如：

```env
TELEGRAM_BOT_TOKEN=123456789:...
TELEGRAM_BOT_USERNAME=CraneMailFilesBot
```

如果只允许特定 Telegram 账号使用 bot，可以配置：

```env
ALLOWED_TELEGRAM_USERS=123456789,some_username
```

这个值支持逗号分隔的 Telegram numeric user ID 或 username。

### 4. 部署到 Vercel

把仓库推送到 GitHub，然后在 Vercel 中从该仓库创建项目。

项目设置建议如下：

- Framework Preset: `Next.js`
- Install Command: `npm install`
- Build Command: `npm run build`
- Output Directory: 保持 Vercel 默认值

在 Vercel 中为 `Production` 配置这些环境变量：

```env
NEXT_PUBLIC_SITE_URL=https://your-domain.example
NEXT_PUBLIC_SMARTERMAIL_URL=https://us1.workspace.org
SMARTERMAIL_CLIENT_ID=cranemail-files-app
PUBLIC_FOLDER=/public
TIMEZONE=Asia/Shanghai

ENCRYPTION_KEY=your-stable-random-secret

TELEGRAM_BOT_TOKEN=123456789:...
TELEGRAM_BOT_USERNAME=CraneMailFilesBot
ALLOWED_TELEGRAM_USERS=

TURSO_DATABASE_URL=libsql://...
TURSO_AUTH_TOKEN=...
```

添加或修改环境变量后需要重新部署。Vercel 已经构建完成的部署不会自动使用之后才修改的环境变量。

生产环境必须使用 Turso。不要在 Vercel 上依赖本地 `local.db` fallback，因为 serverless 文件系统不是可靠的持久数据库。

### 5. 注册 Telegram Webhook

Vercel 部署可访问后，用生产环境 URL 注册 webhook：

```bash
curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook?url=https://your-domain.example/api/telegram/webhook"
```

检查 webhook 是否正确：

```bash
curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getWebhookInfo"
```

返回中应包含：

```json
{
  "ok": true,
  "result": {
    "url": "https://your-domain.example/api/telegram/webhook"
  }
}
```

如果 `url` 为空、指向了本地 tunnel、指向了其他部署，或 `last_error_message` 显示投递失败，请用正确的生产环境 URL 重新执行 `setWebhook`。

注意：`npm run dev:bot` 启动本地 polling 前会删除当前 Telegram webhook。完成本地 bot 调试后，一定要重新注册生产环境 webhook。

### 6. 验证部署

打开生产站点：

```text
https://your-domain.example
```

按顺序验证主要流程：

1. 使用 CraneMail 账号登录。
2. 打开 `/upload`。
3. 从 Web dashboard 上传一个小文件。
4. 生成 Telegram 绑定 token。
5. 打开生成的 Telegram bot 链接，并发送 `/start <token>`。
6. 确认 bot 返回绑定成功消息。
7. 给 bot 发送一张照片，确认它返回 CraneMail 公开链接。

Vercel logs 中应该能看到 Telegram 请求：

```text
POST /api/telegram/webhook
```

### 7. 部署排查

如果 Telegram 绑定没有任何反应：

- 执行 `getWebhookInfo`，确认 `url` 指向 Vercel 生产环境 endpoint。
- 确认 Vercel `Production` 中配置了 `TELEGRAM_BOT_TOKEN`。
- 确认修改 Vercel 环境变量后已经重新部署。
- 查看 Vercel function logs 是否出现 `POST /api/telegram/webhook`。
- 如果跑过 `npm run dev:bot`，重新执行 `setWebhook`。

如果能生成绑定 token，但 Telegram 提示 token 无效：

- 确认 Vercel 应用使用的是生成 `bind_tokens` 的同一个 Turso 数据库。
- 确认 `TURSO_DATABASE_URL` 和 `TURSO_AUTH_TOKEN` 配置在 `Production` 环境。
- 重新生成绑定 token；token 会在 10 分钟后过期。

如果 bot 可以绑定但不能上传：

- 确认用户最近通过 Web 绑定流程验证过 CraneMail 凭据。
- 确认 `PUBLIC_FOLDER` 存在，或应用有权限创建该目录。
- 查看 Vercel logs 中的 SmarterMail API 错误。

## 数据库

应用会自动初始化以下表：

- `users`
- `app_sessions`
- `smartermail_sessions`
- `bind_tokens`
- `uploaded_files`

本地开发默认使用：

```text
local.db
```

生产环境建议配置 `TURSO_DATABASE_URL` 和 `TURSO_AUTH_TOKEN` 使用 Turso/libSQL。

## CraneMail 存储行为

Web 上传文件会保存到：

```text
PUBLIC_FOLDER/YYYY/MM/DD
```

例如：

```text
/public/2026/06/15
```

上传后，应用会生成 CraneMail workspace 公开链接，并把文件元数据保存到 `uploaded_files`。

Workspace 同步会递归扫描 `PUBLIC_FOLDER`，并根据 `fileId` 或 `publicLink` 导入本地尚未存在的文件。

从 Web 面板删除文件时，应用会先真正删除 CraneMail workspace 文件。只有 workspace API 返回删除成功后，本地数据库记录才会被移除。

## Telegram Bot

Bot 当前支持：

- `/start <token>` - 绑定 Telegram 到 CraneMail 账号
- 上传照片或文档 - 上传到 CraneMail 并返回公开链接
- `/list`、`/files` 或 `📂 My Files` - 查看最近上传
- `/help` 或 `❓ Help` - 查看帮助

绑定 Telegram 账号：

1. 在 Web dashboard 登录。
2. 打开 Telegram integration 面板。
3. 生成绑定 token。
4. 通过生成的链接打开 bot。
5. 向 bot 发送文件或照片。

Bot 上传文件会使用同样的 CraneMail `PUBLIC_FOLDER/YYYY/MM/DD` 目录结构，并把元数据写入同一个 `uploaded_files` 表。

## 安全说明

- 请妥善保护 `ENCRYPTION_KEY`、`TELEGRAM_BOT_TOKEN` 和 Turso credentials。
- 如果 bot 只应开放给特定账号，请配置 `ALLOWED_TELEGRAM_USERS`。
- 请谨慎轮换 `ENCRYPTION_KEY`。更换后，已有加密密码无法解密，除非你执行迁移或让用户重新绑定。
- CraneMail workspace 文件删除是破坏性操作，本应用无法撤销。
