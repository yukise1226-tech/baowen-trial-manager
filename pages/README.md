# pages/ —— Cloudflare Pages 部署副本（测试站）

- `index.html` 是主开发 HTML（`outputs/保温试验排程_V0.6-dev.html`）的部署副本；
  修改页面请先改主 HTML，再同步复制到 `pages/index.html`，不要让两个版本独立演化。
- 部署方式（项目名 `baowen-tool`，账号由 wrangler 登录决定）：

  ```bash
  npx wrangler pages deploy pages --project-name=baowen-tool --branch main
  ```

- Pages URL：`https://baowen-tool.pages.dev`
- 本目录不含任何 Secret；SYNC_TOKEN 只在用户浏览器 session 中输入，绝不写入本目录/Git/URL。
- 数据不存 Pages；业务数据仍在浏览器 localStorage，并经 Worker + Durable Object 手动同步
  （`https://baowen-sync.cloud-sync-worker.workers.dev/sync`）。
- Pages 域名与本地 file:// 的 localStorage 相互独立；首次打开 Pages 后请先「从云端拉取」。
- 更新正式 HTML 后必须重新执行上面的部署命令（或先同步本目录再部署）。
