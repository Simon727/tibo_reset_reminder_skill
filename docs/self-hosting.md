# 免费自部署指南

本文面向希望自行维护公共 Feed 的项目维护者。普通 Skill 用户不需要 Vercel、Upstash 或任何 X API Token。

## 所需服务

- Vercel Hobby
- Upstash Redis 免费实例
- Upstash QStash 免费计划

这些服务的免费政策可能调整，部署前请查看 [Vercel Cron 文档](https://vercel.com/docs/cron-jobs/usage-and-pricing)、[QStash 价格页](https://upstash.com/pricing/qstash)和 [Redis 价格页](https://upstash.com/pricing/redis)。

## 1. 部署到 Vercel

将仓库导入 Vercel，并使用默认项目设置完成第一次部署。

## 2. 连接 Redis

从 Vercel Marketplace 添加 Upstash for Redis，并把实例连接到项目。代码支持以下任意一组变量名：

```text
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
```

或：

```text
KV_REST_API_URL
KV_REST_API_TOKEN
```

## 3. 配置刷新密钥

生成至少 32 字节的随机值，保存为 Vercel 环境变量：

```text
REFRESH_SECRET
```

为 Production、Preview 和 Development 分别设置后重新部署。不要把实际密钥提交到仓库、提示词或日志。

## 4. 初始化缓存

向刷新接口发送一次已授权请求：

```bash
curl -X POST "https://你的域名/api/refresh" \
  -H "Authorization: Bearer ${REFRESH_SECRET}"
```

随后检查：

```text
https://你的域名/api/health
https://你的域名/api/feed
```

## 5. 创建 QStash 计划

创建以下计划：

| 字段 | 值 |
| --- | --- |
| Cron | `*/5 * * * *` |
| Method | `POST` |
| Destination | `https://你的域名/api/refresh` |
| Forwarded header | `Authorization: Bearer <REFRESH_SECRET>` |
| Retries | `1` |

每 5 分钟一次是每天 288 次正常投递。配置一次重试后，即使每次都失败并重试，最多也是每天 576 条，低于本文编写时 QStash Free 每天 1,000 条的额度；仍应以官方价格页的当前限制为准。

## 6. 验证

确认以下结果：

- `/api/health` 返回 `ok: true` 和最近成功时间。
- `/api/feed` 返回标准化帖子数组，并且 `stale` 为 `false`。
- 未携带正确密钥调用 `/api/refresh` 时返回 `401`。
- 使用 `GET /api/refresh` 时返回 `405`。
- 下一次 QStash 计划运行后，`last_success_at` 会更新。

## 可选的官方 API 故障恢复

维护者可以设置 `X_BEARER_TOKEN`，让刷新服务在公开网页不可用时尝试 X API v2。它只是可选恢复路径，不应成为最终用户的安装要求。

更多内部行为见 [`architecture.md`](architecture.md)。
