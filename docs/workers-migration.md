# CraneMail Files Workers 切换与回滚手册

切换期间只保留一个可写的生产环境。文件本体留在 CraneMail，迁移和回滚都以当前可写数据库为应用记录的权威来源。生产站点使用 `https://0o.tn`，生产 D1 `cranemail-files` 使用 `wrangler.production.jsonc`，本地开发使用 `wrangler.jsonc`。生产 Turso 已导入 D1，重新取样时，13 张表共 23 条记录的内容仍与已核验的导入快照一致。

## 本地验证

使用 Node.js 24 和 `pnpm install --frozen-lockfile` 安装固定版本的 OpenNext 和 Wrangler。本地普通配置从 `wrangler.jsonc` 的 `vars` 读取。`secrets.required` 声明必需的密钥名，本地密钥值填在 Git 忽略的 `.dev.vars` 中，可从 `.dev.vars.example` 复制。本地构建和开发服务器无需 `.env` 或 `.env.local`。需要启用旧站回滚时，使用切换前留存的旧版制品和它的运行环境。

```sh
pnpm db:migrate
pnpm bundle
pnpm dev --port 8787
```

端到端上传探针使用已构建的 Worker，自行启动本地开发服务器、临时 D1 和模拟上游。需要 Chrome、OpenSSL 及空闲的 `8787` 端口。Chrome 不在 macOS 默认路径时，通过 `WORKERS_PROBE_CHROME` 指定可执行文件。

```sh
node scripts/workers/app-stream-probe.mjs
WORKERS_PROBE_CHUNK_BYTES=8388608 node scripts/workers/app-stream-probe.mjs
```

探针通过实际的 `/api/upload` 路由并发上传两份文件，每份分两段发送，每段大小由 `WORKERS_PROBE_CHUNK_BYTES` 设置。默认每份 1 MiB，上面的第二条命令验证每份 16 MiB。模拟上游先收到文件字节，浏览器才放行尾段。探针还校验 multipart 和文件内容，并用普通浏览器 `File` 验证上游响应缺失文件 ID 时仍能恢复元数据、生成分享链接和短链。

随 16 MiB 本地探针采样的 workerd 进程累计增加约 80 ms CPU，最高采样 RSS 为 64 MiB。同期 Wrangler 本地追踪采集了 15 个 `d1_all` 和 1 个 `d1_run` span，覆盖整个预览探针的采样区间。生产部署报告 gzip 包约 1.59 MiB，部署校验记录的 Worker 启动时间为 57 ms。单次线上上传的 CPU、内存和 D1 用量待真实上游验收。

## 切换前准备

1. 确认停写后的 Turso 快照、D1 导入校验结果和回滚备份仍可访问。记录切换版本、应用迁移版本、域名和每个生产 bot 当前的 webhook URL。按 [Worker Preview 配置说明](../README.zh-CN.md#分享-cloudflare-worker-preview) 部署分支预览，用独立 D1、测试 CraneMail 账号和测试 bot 完成回归。
2. 在独立数据库上演练回滚。将包含新短码、新索引、会话、绑定及删除的 D1 快照还原到适合旧站的空库。目标环境用自己的迁移历史表。复制应用记录时保留原主键、时间值、`NULL`、大小写敏感的短码及密文。
3. 备份并保管原有的 `ENCRYPTION_KEY` 和 `BETTER_AUTH_SECRET`。为 Worker 和回滚环境提供相同密钥，保留正式的 `NEXT_PUBLIC_SITE_URL`、`BETTER_AUTH_URL` 和会话 Cookie 配置。用仍有效的会话验证切换后可以打开同一正式域名。
4. 确认 `wrangler.production.jsonc` 的 `vars` 中的正式地址，运行 `pnpm bundle --config wrangler.production.jsonc`。构建脚本只把允许的普通配置留在 OpenNext 运行时配置中。`secrets.required` 中声明的两项密钥从现有 Worker Secrets 继承。如果需要重建 Worker，首次部署时通过 `--secrets-file` 提供仓库外的私有密钥文件。先部署没有公开路由的 Worker，再准备为 `0o.tn` 绑定 Custom Domain，并保存现有 DNS 记录供回滚。

## 生产切换

1. 在旧站和后台暂停可能写库或改动 CraneMail 的入口，包括登录、登出、上传、删除、目录同步、Telegram 配置、绑定兑换和 webhook。让正在处理的请求结束，记录最后写入时间。维护期间为 webhook 返回可重试的错误，避免把尚未处理的更新应答为成功。
2. 核对已导入的生产 D1 绑定、停写时间和导入校验记录。将数据库备份和核验副本保存在访问受限的位置。若旧站在导入后恢复过写入，先对账并同步差异，再继续切换。
3. 依据停写快照逐表核对行数和主键，并比较应用数据的有序内容校验值。抽检旧短码和目标链接、上传索引的文件 ID、有效会话、加密凭据、bot 配置及已处理的 Telegram 更新。
4. 在继续停写的情况下核验正式域名上的 Worker 路由和旧短链。原 webhook URL 随域名切换时，核查 Telegram 已到达新后端。只有 URL 或配置确有变化时，按获准方案更新 webhook。维持 bot ID、验证密钥和已处理更新记录。
5. 开放 Worker 写入，记录开放时间。检查新登录、上传、短码跳转、目录同步和 Telegram 更新。旧站继续保持停写，直到回滚窗口结束。

## 回滚

### D1 开放写入前

将域名和必要的 webhook 路由切回旧站。确认旧站仍对应停写时的源库，检查旧短码和有效会话后恢复写入。保留失败版本及 D1 快照供排查。

### D1 开放写入后

1. 暂停 Worker 写入和 Telegram webhook，确认旧站也停写，并等待在途上传、删除、同步和 webhook 结束。对结果未知的文件操作保留请求 ID、文件名和相应 CraneMail 文件 ID，待核对上游状态。
2. 导出停写时的 D1 应用数据并保存一份独立快照。将数据还原到按旧站兼容 schema 迁移的新库。D1 快照包含切换以来的新增、更新和删除。旧站原库保留为切换前备份。
3. 对比 D1 和回滚库的逐表数据，抽查开放写入后产生的短码、上传索引、会话和 Telegram 更新。确认被删除的文件索引和解绑记录未恢复。核对 CraneMail 中已存在但尚未写入索引的文件，按上游文件 ID 补齐索引和可确认的短码。
4. 让旧站连接已核验的回滚库，沿用原密钥和域名配置。切回流量和必要的 webhook 路由，先验证旧短码、切换期间的新短码和有效会话，再恢复旧站写入。D1 保持停写。

如果回滚库无法完整承接 D1 的新增记录、修改或删除，保持停写，修正并重新核验恢复结果后再开放旧站。
