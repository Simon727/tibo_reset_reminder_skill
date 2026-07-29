# 公共 Feed 架构

本文面向项目维护者。普通安装用户只需读取主 README，并不需要部署这些服务。

## 数据流

```text
Upstash QStash（每 5 分钟）
        ↓ POST /api/refresh
Vercel Function → X 公开网页（Embed 作为补充）
        ↓
Upstash Redis（保存最多 30 天、200 条帖子）
        ↓ GET /api/feed
所有已安装 Skill 的 Agent
```

这是一套中心化低频轮询服务，不是 X 主动推送的 Webhook。X 的公开推文 Webhook 需要官方开发者 API。

## 接口

### `GET /api/feed`

返回经过账号核验和标准化的公开帖子数据，允许跨域读取，不包含密钥。Skill 默认只使用这个接口。

### `GET /api/health`

返回最近一次抓取尝试、最近一次成功时间、缓存是否过期和当前帖子数量，供用户与维护者判断服务状态。

### `POST /api/refresh`

负责读取、核验、合并和缓存帖子。请求必须携带：

```http
Authorization: Bearer <REFRESH_SECRET>
```

没有授权或使用错误的 HTTP Method 时，接口会拒绝请求。

## 数据获取与核验

中心服务读取 X 公开网页中的语义数据，并在可用时使用公开 Embed 补充内容。只有能核验为 `@thsottiaux` 的帖子才会进入 Feed；普通转推以及其他作者的引用内容不会冒充目标账号原创内容。

项目维护者可以设置 `X_BEARER_TOKEN` 作为官方 API 的可选故障恢复通道，但它不是最终用户的安装要求。

禁止把 Google Cache、搜索结果片段、公共 Nitter 或任意抓取代理作为数据源。这些来源可能过期、缺少上下文、触发额外权限请求，或者让 Agent 长时间等待。

## 缓存与失败行为

- Redis 保存最多 30 天、200 条经过核验的帖子。
- 刷新过程使用 Redis 锁，防止多个任务同时合并缓存。
- 上游抓取失败时保留最后一次成功数据，不会用空结果覆盖缓存。
- 缓存超过允许的新鲜度后，Feed 标记 `stale: true`。
- Skill 将 `stale: true` 视为抓取失败并保持静默，不能把旧缓存解释为“没有新推文”。

## 七天历史覆盖

Feed 会逐步积累连续历史。在服务上线未满 7 天或连续性中断时，`seven_day_history_complete` 为 `false`。

此时首次运行只能报告：

```text
当前可核验范围内至少 N 次
```

只有连续覆盖完整 7 天后，Agent 才能给出精确的七天重置次数。

## 安全边界

- `REFRESH_SECRET` 只存在于部署环境和 QStash 的转发请求中。
- 公共 Feed 是只读接口，不返回任何密钥。
- 用户的对话内容、通知对象和本地去重状态不会发送给公共 Feed。
- 每个 Agent 宿主负责自己的定时任务权限、状态文件和通知渠道。

部署步骤见 [`self-hosting.md`](self-hosting.md)，故障处理见 [`troubleshooting.md`](troubleshooting.md)。
