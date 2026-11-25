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
| `SMARTERMAIL_CLIENT_ID` | 认证客户端标识，通常保留 `cranemail-files-app` 即可。 |

浏览器通过 HttpOnly cookie 使用本地应用会话，会话在登录 30 天后到期。面板从应用数据库读取当前账号和文件列表。登录和绑定 Telegram 时会向 CraneMail 验证凭据。服务端加密保存 CraneMail 凭据，用于上传、同步、删除文件和清理空目录时续期授权。CraneMail 暂时不可用或拒绝文件操作时，本地会话仍然有效。退出登录会撤销当前浏览器的应用会话。

请部署到可信服务器，妥善保管凭据，并同时备份数据库与 `ENCRYPTION_KEY`。更换密钥后，已有加密凭据无法解密。用户需要重新登录以恢复工作区访问，也可能需要重新绑定 Telegram。

### 启用自己的 Telegram bot

先设置 `NEXT_PUBLIC_SITE_URL` 为站点的公开 HTTPS 地址，并设置稳定的 `ENCRYPTION_KEY`。升级已有部署时，先运行 `pnpm db:migrate`，再启动新版本。迁移会保留 CraneMail 账号、会话和已上传文件；旧版 Telegram 绑定和待使用链接会被移除，需要在网页添加机器人并重新绑定各个 CraneMail 账号。

在网页的 **Telegram Bots** 中添加 BotFather token 即可。每个机器人的接收地址为：

```text
https://files.example.com/api/telegram/webhook/<bot-id>
```

应用使用 grammY 处理消息和 Bot API 调用。连接机器人时会注册私聊命令菜单。已连接的机器人可在 **Telegram Bots** 中再次提交同一个 token 来刷新菜单。应用只订阅消息与按钮回调，并校验 Telegram 的 `X-Telegram-Bot-Api-Secret-Token` 请求头。已处理的更新会去重；未处理完成的临时错误会返回非 2xx 状态供 Telegram 重试。上传业务失败会向用户提示，用户可重新发送文件。

一个 Telegram 机器人只有一个 webhook。连接到本站会替换该机器人原来的 webhook，请使用专门用于本站的机器人。token 不会在查询接口中返回。多个 CraneMail 账号配置同一个 token 时会共用同一机器人记录和 webhook，但每个 Telegram 用户只能查看和选择自己已绑定的账号。

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

检查 bot token 和 `getWebhookInfo`，并在 10 分钟内使用新生成的绑定链接。网页和 webhook 必须连接同一个数据库。

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
