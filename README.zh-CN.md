<img src="public/brand/crane.svg" alt="" width="56" height="56">

# CraneMail Files

简体中文 · [English](./README.md)

**上传文件，复制链接，随时分享。**

CraneMail Files 把你的 CraneMail workspace 存储变成一个方便查找和分享的文件库。通过浏览器或 Telegram 上传图片、文档，再一键复制短链接或 Markdown，发给朋友、插入文章或用于项目文档。

文件保存在你的 CraneMail workspace 中。你可以把这个应用部署到自己的域名上，管理上传记录和分享链接。

<!-- 在此添加网页版面板截图。 -->

## 它能帮你做什么

| 你想要…… | 可以这样做 |
| --- | --- |
| 分享截图、图片或文档 | 拖入文件、批量选择文件，或从剪贴板直接粘贴上传。 |
| 在文章、笔记或 README 中插图 | 从文件库复制短链接或现成的 Markdown。 |
| 用手机快速上传 | 把照片或文档发给已绑定的 Telegram bot。 |
| 找回以前上传的文件 | 按文件名搜索、按来源筛选，切换网格或列表视图。 |
| 使用 workspace 中已有的文件 | 同步指定的分享目录，无需重新上传。 |
| 整理存储空间 | 删除不需要的文件，清理空的日期目录。 |

使用前需要一个支持 workspace 文件存储的 CraneMail 账号。本项目基于 CraneMail 开发和测试，不保证兼容其他 SmarterMail 服务。

还没有账号？可以通过维护者的 [NameCrane 推荐链接](https://namecrane.com/r/434/email)注册。

## 上传与分享

### 分享第一个文件

1. 打开已部署的站点，使用 CraneMail 邮箱或用户名及密码登录。如果使用其他 CraneMail 服务器，展开 **Server Endpoint** 修改地址。
2. 把文件拖到上传区域，点击选择文件，或直接粘贴剪贴板中的截图。
3. 上传完成后点击 **Copy Link**。
4. 把链接发给对方；需要插入文档时，选择 **Copy Markdown**。

**Copy Link** 默认复制应用短链接，例如 `https://files.example.com/s/abc1234`。**Copy Original Link** 复制 CraneMail 原始存储链接。接收者无需登录本应用即可访问公开链接。

上传的文件按日期存放在配置的分享目录中，例如 `/public/2026/11/24`，占用你的 CraneMail 存储配额。

### 把 workspace 现有文件加入文件库

在文件库中点击 **Sync Workspace**，扫描配置的 `PUBLIC_FOLDER` 及其子目录。尚未记录的文件会加入文件库，缺少公开链接的文件会尝试生成公开链接。

**同步可能会公开该目录中原本未分享的文件。** 建议使用专门的分享目录，把私密文件放在其他位置。

你可以通过搜索和来源筛选找到网页上传、Telegram 上传或 workspace 同步的文件。图片还支持放大预览。

### 通过 Telegram 上传

如果站点部署者已经配置 bot：

1. 在面板中点击 **Link Telegram**。
2. 输入 CraneMail 密码，生成绑定链接。
3. 打开 bot 链接并点击 **Start**，或发送页面显示的 `/start <token>` 命令。绑定 token 在 10 分钟后过期。
4. 给 bot 发送照片或文档，等待它回复短链接和原始存储链接。

发送 `/files`、`/list` 或点击 **📂 My Files** 查看文件；发送 `/help` 查看帮助。需要保留图片原文件时，请以文档形式发送。

### 公开链接与删除操作

- 短链接和原始链接都属于公开链接，任何获得链接的人都可以访问文件。本应用没有给链接增加密码或有效期。
- **删除会同时删除 CraneMail 中的实际文件和应用记录**，不只是从列表中隐藏，本应用无法撤销。
- 短链接依赖本应用、域名和数据库。迁移或升级时，需要保留数据库中的短码记录。
- 删除后，已有的短链接跳转可能在浏览器中缓存最多 60 秒，在共享缓存中保留最多 300 秒。删除也无法收回他人已经下载的副本。

## 部署自己的站点

需要 Node.js **20.9 或更新版本**、pnpm，以及支持 workspace 存储的 CraneMail 账号。Telegram 集成可按需启用。

有持久磁盘的 Node 服务器可以使用本地 SQLite；Vercel 等没有持久可写文件系统的环境需要配置远程 Turso/libSQL 数据库。

### 1. 安装与配置

克隆或下载仓库，进入项目目录后执行：

```bash
pnpm install
cp .env.example .env.local
openssl rand -hex 32
```

把生成的随机值填入 `ENCRYPTION_KEY`。本地试用至少需要确认以下配置：

```env
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_SMARTERMAIL_URL=https://us1.workspace.org
PUBLIC_FOLDER=/public
TIMEZONE=Asia/Shanghai
ENCRYPTION_KEY=replace-with-your-generated-key
```

公开部署时，**在构建前**把 `NEXT_PUBLIC_SITE_URL` 改为自己的 HTTPS 域名，例如 `https://files.example.com`。它用于生成短链接、canonical 地址、社交分享信息和站点地图。请填写域名根地址，不要附带路径、查询参数或锚点；修改后重新构建。

### 2. 初始化数据库并启动

```bash
pnpm db:migrate
pnpm dev
```

打开 [localhost:3000](http://localhost:3000)，登录并上传一个小文件。

在 Node 服务器上运行生产版本：

```bash
pnpm db:migrate
pnpm build
pnpm start
```

使用 SQLite 时，确保 `local.db` 位于持久磁盘上。每次启动新版本前先执行数据库迁移；应用只检查数据库是否就绪，不会在处理请求时自动建表或升级表结构。

### 部署到 Vercel

1. 创建 Turso 数据库，取得数据库 URL 和访问 token。
2. 在 Vercel 中导入仓库，使用 Next.js 项目类型。
3. 为对应的部署环境配置下表中的环境变量，包括公开域名、稳定的加密密钥和 Turso 凭据。
4. 安装命令使用 `pnpm install --frozen-lockfile`，构建命令使用 `pnpm db:migrate && pnpm build`。
5. 部署后测试登录、小文件上传，以及复制出的分享链接。

Vercel 上不要使用 `local.db` 回退存储。生产和预览环境应使用不同数据库，因为迁移命令会操作当前环境变量指向的数据库。

上传大小和执行时间限制请参考[托管平台限制](https://vercel.com/docs/functions/limitations)。网页上传会经过应用服务器，因此托管平台和 CraneMail 账号的限制都会影响上传结果。

### 配置项速查

| 环境变量 | 应该填写什么 |
| --- | --- |
| `NEXT_PUBLIC_SITE_URL` | 应用的公开根地址；为空时回退到 `http://localhost:3000`。需要在构建前配置。 |
| `NEXT_PUBLIC_SMARTERMAIL_URL` | 默认 CraneMail 服务器，例如 `https://us1.workspace.org`。用户可在登录时修改服务器地址。 |
| `PUBLIC_FOLDER` | 上传和同步使用的目录，默认 `/public`。建议使用专门的分享目录。 |
| `TIMEZONE` | 日期目录和 bot 时间显示使用的时区，默认 `Asia/Shanghai`。 |
| `ENCRYPTION_KEY` | 足够长、保密且稳定的密钥。用 `openssl rand -hex 32` 生成，并替换示例中的开发密钥。 |
| `TURSO_DATABASE_URL` | 远程 libSQL 数据库地址；有持久磁盘的服务器可留空，使用 `local.db`。 |
| `TURSO_AUTH_TOKEN` | 远程数据库需要的访问 token。 |
| `TELEGRAM_BOT_TOKEN` | 可选，在 [@BotFather](https://t.me/BotFather) 创建 bot 后取得。 |
| `TELEGRAM_BOT_USERNAME` | bot 用户名，不带 `@`，用于生成绑定链接。 |
| `ALLOWED_TELEGRAM_USERS` | 可选，逗号分隔的 Telegram 用户 ID 或不带 `@` 的用户名。留空时，任何 Telegram 用户都可以绑定自己的 CraneMail 账号。 |
| `SMARTERMAIL_CLIENT_ID` | 认证客户端标识，通常保留 `cranemail-files-app` 即可。 |

应用会在服务端加密保存 CraneMail 密码和会话 token，用于续期登录。浏览器使用 HttpOnly 应用会话 cookie。请部署到可信服务器，妥善保管凭据，并同时备份数据库与 `ENCRYPTION_KEY`。更换密钥后，已有加密凭据无法解密，用户需要重新登录，也可能需要重新绑定 Telegram。

### 启用自己的 Telegram bot

通过 [@BotFather](https://t.me/BotFather) 创建 bot，配置 `TELEGRAM_BOT_TOKEN` 和 `TELEGRAM_BOT_USERNAME`，然后重新部署。接收消息的公开 HTTPS 地址为：

```text
https://files.example.com/api/telegram/webhook
```

在终端中导出实际 bot token，再注册和检查 webhook。执行前把示例域名替换为自己的站点：

```bash
export TELEGRAM_BOT_TOKEN='your-bot-token'
curl --fail-with-body --request POST \
  --data-urlencode 'url=https://files.example.com/api/telegram/webhook' \
  "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook"
curl --fail-with-body \
  "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo"
```

检查 `result.url` 是否与部署地址一致，以及 `last_error_message` 是否报告投递问题，然后按照前面的[绑定步骤](#通过-telegram-上传)操作。

本地开发 bot 可运行 `pnpm dev:bot`。**该命令会删除 bot 当前的 webhook**，改用轮询接收消息。建议使用独立的开发 bot，或在调试结束后重新注册生产环境 webhook。

## 常见问题

**必须配置 Telegram 和 Turso 才能试用吗？**

不需要。本地使用 SQLite 和浏览器上传即可。需要手机上传时再启用 Telegram；托管环境需要远程数据库时再配置 Turso/libSQL。

**为什么看不到 workspace 中已有的文件？**

点击 **Sync Workspace**，并确认文件位于配置的 `PUBLIC_FOLDER` 中。刷新文件库只会重新读取应用已经记录的文件。

**为什么短链接指向 localhost 或旧域名？**

修正 `NEXT_PUBLIC_SITE_URL`，重新构建并部署。如果要让过去分享的链接继续可用，需要保留旧域名的访问。

**为什么上传失败？**

先用小文件测试，再检查 CraneMail 剩余配额和分享权限，以及托管平台的请求大小、执行时间限制。Bot 上传还需要检查服务端日志中的 Telegram 下载或 CraneMail 上传错误。

**Telegram 没反应，或者提示绑定 token 无效？**

检查 bot token、允许用户列表和 `getWebhookInfo`，并在 10 分钟内使用新生成的绑定链接。网页和 webhook 必须连接同一个数据库。如果运行过 `pnpm dev:bot`，需要恢复 webhook。

**为什么提示 “Database is not ready”？**

对部署实际使用的数据库执行 `pnpm db:migrate`，并检查数据库 URL 和 token。只重启应用不会执行数据库迁移。

**搜索引擎和社交分享会展示什么？**

公开首页提供 canonical 地址和品牌分享图；配置了公开域名的部署只把首页加入站点地图。上传面板、API 响应和文件短链接包含 `noindex` 指令，本地地址和 Vercel 预览构建也设为 `noindex`。这些指令用于引导遵守规则的爬虫，不是访问权限控制。

## 参与开发

项目使用 Next.js App Router、React、Hono、Drizzle/libSQL、shadcn/ui 和 Tailwind CSS。

```bash
pnpm lint
pnpm exec tsc --noEmit
pnpm test
```

修改数据库时，更新 `lib/db/schema.ts`，执行 `pnpm db:generate`，检查生成的迁移文件，再运行 `pnpm db:migrate`。使用 `pnpm db:studio` 可打开数据库浏览器。

品牌素材及可编辑的分享图 SVG 位于 [`public/brand`](./public/brand)，站点 metadata 集中在 [`lib/site.ts`](./lib/site.ts)。
