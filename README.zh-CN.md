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

1. 在面板中打开 **Telegram Bots**，粘贴你在 BotFather 创建的机器人的 token，点击 **Connect bot**。服务端会校验机器人、加密保存 token，并自动注册带独立验证密钥的 webhook，无需配置 Bot 环境变量。
2. 选择机器人，点击 **Link account**，输入当前 CraneMail 账号的密码，生成有效期为 10 分钟的绑定链接。
3. 打开链接并点击 **Start**，或在该机器人的私聊中发送 `/start <token>`，然后返回网页检查绑定状态。
4. 给机器人发送照片或文档，等待它回复目标邮箱、短链接和原始存储链接。需要保留图片原文件时，请以文档形式发送。

同一个机器人可以连接多个 CraneMail 账号：分别登录各个账号，添加同一个机器人的 token，再完成绑定。添加账号会保留原有绑定和当前上传账号。在 Telegram 发送 `/accounts` 或点击 **👤 Accounts**，选择后续上传和文件查询使用的账号。每个机器人、每个 Telegram 用户的选择相互独立。

发送 `/files`、`/list` 或点击 **📂 My Files** 查看当前账号的文件。文件列表分页始终属于生成该列表的账号。上传开始后，目标账号就会固定，期间切换账号只影响之后的操作。网页中的断开按钮只移除当前 CraneMail 账号与该机器人的配置和绑定，不影响其他账号；当前上传账号被移除后，需要在 Telegram 重新选择。

发送 `/search <文件名>` 可按部分文件名搜索当前账号的文件。

### 公开链接与删除操作

- 短链接和原始链接都属于公开链接，任何获得链接的人都可以访问文件。本应用没有给链接增加密码或有效期。
- **删除会同时删除 CraneMail 中的实际文件和应用记录**，不只是从列表中隐藏，本应用无法撤销。
- 短链接依赖本应用、域名和数据库。迁移或升级时，需要保留数据库中的短码记录。
- 删除后，已有的短链接跳转可能在浏览器中缓存最多 60 秒，在共享缓存中保留最多 300 秒。删除也无法收回他人已经下载的副本。

## 部署自己的站点

需要 Node.js **24**、pnpm、用于 Workers 和 D1 的 Cloudflare 账号，以及支持 workspace 存储的 CraneMail 账号。Telegram 集成可按需启用。

### 1. 安装与配置

克隆或下载仓库，进入项目目录后执行：

```bash
pnpm install --frozen-lockfile
cp .dev.vars.example .dev.vars
openssl rand -hex 32
```

把生成的随机值填入 `ENCRYPTION_KEY`。再运行一次 `openssl rand -hex 32`，为 `BETTER_AUTH_SECRET` 生成独立的密钥。

默认部署配置读取 `wrangler.jsonc` 的 `vars`，`secrets.required` 声明必需的密钥名。把本地开发用的密钥值，以及覆盖正式域名的 `NEXT_PUBLIC_SITE_URL` / `BETTER_AUTH_URL`（如 `http://localhost:8787`）填在 Git 忽略的 `.dev.vars` 里。本地 Workers 构建和开发服务器无需 `.env` 或 `.env.local`。

公开部署时，在 `wrangler.jsonc` 的 `vars` 中把 `NEXT_PUBLIC_SITE_URL` 设为自己的 HTTPS 域名，例如 `https://files.example.com`。它用于生成短链接、canonical 地址、社交分享信息和站点地图。请填写域名根地址，不要附带路径、查询参数或锚点。修改后重新构建。

### 2. 初始化数据库并启动

```bash
pnpm db:migrate
pnpm dev
```

打开 [localhost:8787](http://localhost:8787)，登录并上传一个小文件。开发服务器通过 `initOpenNextCloudflareForDev()` 使用 Wrangler 本地 D1 数据库和 `.dev.vars`，支持热更新。

### 分享 Cloudflare Worker Preview

`pnpm preview` 会构建应用，然后通过 `wrangler preview` 在同一个 Worker 下创建或更新分支预览。Wrangler 默认使用当前 Git 分支名。Cloudflare 会返回跟随分支最新部署的固定地址，以及指向本次部署的地址。请用固定地址测试登录和短链接。

1. 在 Cloudflare 控制台打开 Worker 的 **Domains** 页，在 **Worker URL** 下开启 **Preview**，启用 `workers.dev` 预览地址。预览地址默认公开，需要限制访问时可启用 Cloudflare Access。[Cloudflare 路由与访问设置](https://developers.cloudflare.com/workers/previews/custom-domains/)
2. 运行 `pnpm exec wrangler d1 create cranemail-files-preview --update-config=false` 创建独立 D1。把数据库 UUID 填入 `wrangler.jsonc` 的 `previews.d1_databases` 和 `wrangler.preview-migrations.jsonc` 的 `d1_databases`，再运行 `pnpm exec wrangler d1 migrations apply PREVIEW_DB --remote --config wrangler.preview-migrations.jsonc`。使用同一预览 D1 的分支会共享数据和表结构。需要单独演练迁移的分支可在两份配置中使用自己的数据库。[Cloudflare D1 迁移说明](https://developers.cloudflare.com/workers/previews/resources/#d1-migrations)
3. 首次部署时，通过 `--secrets-file` 传入仓库外的私有 JSON 文件，为 `BETTER_AUTH_SECRET` 和 `ENCRYPTION_KEY` 提供独立的值。也可以在 Cloudflare 设置 Previews Base 密钥。[Cloudflare 预览密钥说明](https://developers.cloudflare.com/workers/previews/configuration/#secrets)

例如，预览名为 `feature-login`，Cloudflare 账号的 Workers 子域名为 `my-team` 时，可以这样运行。将示例域名和密钥文件路径换成自己的值。

```bash
PREVIEW_ORIGIN=https://feature-login-cranemail-files.my-team.workers.dev \
  pnpm preview --name feature-login --secrets-file /path/to/preview-secrets.json
```

测试上传、删除或 Telegram webhook 时，使用测试 CraneMail 账号和独立测试 bot。这些操作会实际调用上游服务。

### 部署到 Cloudflare Workers

1. 运行 `pnpm exec wrangler login`，在 Cloudflare 账号创建 D1 数据库。在 `wrangler.jsonc` 里填写 Worker 名称和 D1 数据库 ID，使用 `DB` 作为 binding 名称。
2. 在 `wrangler.jsonc` 的 `vars` 里设置正式 HTTPS 地址，再运行 `pnpm bundle`。配置已在 `secrets.required` 中声明两项必需的密钥名。
3. 运行 `pnpm db:migrate:remote`（即 `wrangler d1 migrations apply DB --remote`），迁移生产 D1。
4. 在 Cloudflare 控制台或配置中绑定自定义域名。运行 `pnpm cf:deploy`（会先执行远程 D1 迁移再运行 `wrangler deploy`，在 Workers Builds 中可将构建命令设为 `pnpm bundle`、部署命令设为 `pnpm cf:deploy`），复用现有的 Worker Secrets。首次部署新 Worker 时，可先通过 `pnpm exec wrangler deploy --secrets-file /path/to/production-secrets.json`，在仓库外的私有 JSON 文件中提供两项密钥的值。验证登录、小文件上传和生成的短链。

网页上传由浏览器把文件送到 Worker，Worker 再流式封装为 CraneMail 的 multipart 请求。可上传大小受 [Workers 请求限制](https://developers.cloudflare.com/workers/platform/limits/)和 CraneMail 账号配额影响。

### 配置项速查

| 环境变量 | 应该填写什么 |
| --- | --- |
| `NEXT_PUBLIC_SITE_URL` | 应用的公开根地址。需要在构建前配置。 |
| `NEXT_PUBLIC_DISABLE_INDEXING` | 在线预览构建可设为 `1`。 |
| `NEXT_PUBLIC_SMARTERMAIL_URL` | 默认 CraneMail 服务器，例如 `https://us1.workspace.org`。用户可在登录时修改服务器地址。 |
| `PUBLIC_FOLDER` | 上传和同步使用的目录，默认 `/public`。建议使用专门的分享目录。 |
| `TIMEZONE` | 日期目录和 bot 时间显示使用的时区，默认 `Asia/Shanghai`。 |
| `ENCRYPTION_KEY` | 足够长、保密且稳定的密钥。用 `openssl rand -hex 32` 生成，并替换示例中的开发密钥。 |
| `BETTER_AUTH_SECRET` | 保密且稳定的会话签名密钥。用 `openssl rand -hex 32` 单独生成。 |
| `BETTER_AUTH_URL` | 可选的认证站点地址，默认使用 `NEXT_PUBLIC_SITE_URL`。预览部署等场景可设置为用户实际访问的地址。 |
| `UPLOAD_MAX_BYTES` | 可选的应用上传上限，单位为字节。 |
| `SMARTERMAIL_CLIENT_ID` | 认证客户端标识，通常保留 `cranemail-files-app` 即可。 |

Better Auth 通过签名的 HttpOnly Cookie 管理本站会话，会话在登录 30 天后到期。面板从应用数据库读取当前账号和文件列表。登录和绑定 Telegram 时会向 CraneMail 验证凭据。服务端加密保存 CraneMail 凭据，用于上传、同步、删除文件和清理空目录时续期授权。CraneMail 暂时不可用或拒绝文件操作时，本站会话仍然有效。退出登录会撤销当前浏览器的会话。

请部署到可信服务器，妥善保管凭据，并同时备份数据库与 `ENCRYPTION_KEY`。更换密钥后，已有加密凭据无法解密。用户需要重新登录以恢复工作区访问，也可能需要重新绑定 Telegram。

### 启用自己的 Telegram bot

将 `NEXT_PUBLIC_SITE_URL` 设为站点的公开 HTTPS 地址，并保持 `ENCRYPTION_KEY` 稳定。

在网页的 **Telegram Bots** 中添加 BotFather token 即可。每个机器人的接收地址为：

```text
https://files.example.com/api/telegram/webhook/<bot-id>
```

应用使用 grammY 处理消息和 Bot API 调用。连接机器人时会注册私聊命令菜单。已连接的机器人可在 **Telegram Bots** 中再次提交同一个 token 来刷新菜单。应用只订阅消息与按钮回调，并校验 Telegram 的 `X-Telegram-Bot-Api-Secret-Token` 请求头。已处理的更新会去重；未处理完成的临时错误会返回非 2xx 状态供 Telegram 重试。上传业务失败会向用户提示，用户可重新发送文件。

一个 Telegram 机器人只有一个 webhook。连接到本站会替换该机器人原来的 webhook，请使用专门用于本站的机器人。token 不会在查询接口中返回。多个 CraneMail 账号配置同一个 token 时会共用同一机器人记录和 webhook，但每个 Telegram 用户只能查看和选择自己已绑定的账号。

## 常见问题

**本地试用需要 Cloudflare 账号吗？**

Wrangler 为本地预览提供 D1。线上部署需要 Cloudflare 账号。Telegram 可按需启用。

**为什么看不到 workspace 中已有的文件？**

点击 **Sync Workspace**，并确认文件位于配置的 `PUBLIC_FOLDER` 中。刷新文件库只会重新读取应用已经记录的文件。

**为什么短链接指向 localhost 或旧域名？**

修正 `NEXT_PUBLIC_SITE_URL`，重新构建并部署。如果要让过去分享的链接继续可用，需要保留旧域名的访问。

**为什么上传失败？**

先用小文件测试，再检查 CraneMail 剩余配额和分享权限，以及托管平台的请求大小、执行时间限制。Bot 上传还需要检查服务端日志中的 Telegram 下载或 CraneMail 上传错误。

**Telegram 没反应，或者提示绑定 token 无效？**

检查 bot token 和 `getWebhookInfo`，并在 10 分钟内使用新生成的绑定链接。网页和 webhook 必须连接同一个数据库。

**为什么提示 “Database is not ready”？**

使用部署对应的 Wrangler 配置执行 D1 迁移，并检查 `DB` binding 是否指向正确的数据库。

**搜索引擎和社交分享会展示什么？**

公开首页提供 canonical 地址和品牌分享图。生产部署只把首页加入站点地图。上传面板、API、短链接和已配置的预览构建使用 `noindex`。

## 参与开发

项目使用 Next.js App Router、OpenNext、Hono、Drizzle D1、shadcn/ui 和 Tailwind CSS。

```bash
pnpm lint
pnpm exec tsc --noEmit
pnpm test
```

修改数据库时，更新 `lib/db/schema.ts`，执行 `pnpm db:generate`，检查生成的迁移文件，再运行 `pnpm db:migrate` 验证本地 D1。

品牌素材及可编辑的分享图 SVG 位于 [`public/brand`](./public/brand)，站点 metadata 集中在 [`lib/site.ts`](./lib/site.ts)。
