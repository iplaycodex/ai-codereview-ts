# ai-codereview-ts

一个面向 GitLab Webhook 的 AI 代码评审服务，使用 TypeScript + Express 实现，负责接收 Merge Request 和 Push 事件、拉取变更、调用大模型生成审查意见、回写 GitLab 评论，并把结果同步到 IM 通知和本地 SQLite 日志。

## 项目主要内容

- GitLab Webhook 接入：支持 `merge_request` 和 `push` 两类事件。
- AI 评审链路：拉取 diff 和 commits，过滤可审查文件，按提示词生成评审结果并提取评分。
- 多模型适配：支持 `deepseek`、`openai`、`anthropic`、`qwen`、`zhipuai`、`ollama`、`codex`。
- 结果回写：把 AI Review 结果作为 Note 回写到 GitLab。
- 通知分发：支持钉钉、企业微信、飞书和额外自定义 Webhook。
- 本地持久化：使用 `sql.js` 将 MR / Push 审查日志写入 `data/data.db`。
- 安全处理：支持代码脱敏、Token 截断、按扩展名过滤变更。

## 架构设计

整体链路是：

`GitLab Webhook -> Express Route -> Worker Handler -> GitLab Adapter -> CodeReviewer -> LLM Client -> GitLab Note / EventEmitter -> IM & SQLite`

核心模块职责如下：

- `src/index.ts`
  服务入口。加载 `conf/.env`，初始化 SQLite，做配置检查并启动 Express。
- `src/routes/`
  HTTP 路由层。对外暴露健康检查和 `/review/webhook`，负责解析 GitLab URL、Token 和事件类型。
- `src/worker/handlers.ts`
  业务编排层。分别处理 MR 和 Push 事件，做草稿过滤、受保护分支判断、去重、调用评审器和发送事件。
- `src/platforms/gitlab/`
  GitLab 适配层。封装 Merge Request / Push 相关 API，包括拉取 changes、commits、compare diff、回写 notes。
- `src/review/`
  评审核心。加载 YAML 提示词模板、执行代码脱敏、统计 token、截断长 diff、解析评分。
- `src/llm/`
  模型抽象层。通过工厂模式切换不同 LLM Provider，统一 `ping` 和 `completions` 接口。
- `src/events/` + `src/im/`
  结果分发层。将审查完成事件广播到通知渠道，并把格式化后的消息推送到 IM。
- `src/service/`
  持久化层。负责初始化 `sql.js` 数据库、插入日志、做 MR 去重校验和简单查询。

## 关键设计点

- 异步处理 Webhook：接口收到请求后先快速返回，再在后台执行评审，避免阻塞 GitLab。
- 双事件模型：MR 走变更审查和 MR Note 回写，Push 走 compare / commit diff 逻辑和 Push Note 回写。
- 文件过滤优先：只对 `SUPPORTED_EXTENSIONS` 中的文件做审查，避免无关 diff 浪费上下文。
- Prompt 外置：提示词位于 `conf/prompt_templates.yml`，不用改代码就能调审查风格。
- Provider 解耦：上层只依赖 `Factory.getClient()`，切模型不影响业务编排。
- 本地日志可追踪：SQLite 保存项目名、作者、分支、评分、评审内容、增删行数等信息。

## 目录结构

```text
.
├── conf/                  # 环境变量模板与 Prompt 模板
├── data/                  # SQLite 数据文件目录
├── src/
│   ├── config/            # 配置读取与启动检查
│   ├── entity/            # 审查日志实体定义
│   ├── events/            # 事件总线
│   ├── im/                # 钉钉 / 企微 / 飞书 / Webhook 通知
│   ├── llm/               # 多模型客户端与工厂
│   ├── logger/            # Winston 日志
│   ├── platforms/gitlab/  # GitLab API 适配
│   ├── review/            # Prompt、Token、评审逻辑
│   ├── routes/            # HTTP 路由
│   ├── sanitizer/         # 代码脱敏
│   ├── service/           # SQLite 持久化
│   └── worker/            # Webhook 事件处理编排
├── ARCHITECTURE.md        # 更详细的架构图
├── Dockerfile
└── docker-compose.yml
```

## 运行方式

### 1. 安装依赖

```bash
yarn install
```

### 2. 准备配置

```bash
cp conf/.env.dist conf/.env
```

至少需要配置：

- `LLM_PROVIDER`
- 对应 provider 的 API Key / Model
- `GITLAB_URL`
- `GITLAB_ACCESS_TOKEN`

常用配置示例：

```env
SERVER_PORT=5001
LLM_PROVIDER=openai
OPENAI_API_KEY=your_api_key
OPENAI_API_MODEL=gpt-4o-mini
GITLAB_URL=https://gitlab.example.com
GITLAB_ACCESS_TOKEN=your_gitlab_token
PUSH_REVIEW_ENABLED=1
MERGE_REVIEW_ONLY_PROTECTED_BRANCHES_ENABLED=0
```

### 3. 本地启动

开发模式：

```bash
yarn dev
```

构建并运行：

```bash
yarn build
yarn start
```

默认端口为 `5001`。

## 安全注意事项

- 本地敏感配置应放在 `conf/.env`，该文件默认被 Git 忽略，不应提交。
- 运行过程生成的审查日志数据库位于 `data/data.db`，也不应提交。
- `conf/.env.dist` 只保留占位符示例，提交前不要把真实 API Key、GitLab Token 或 IM Webhook 地址写进仓库。

## Webhook 接入

服务提供两个 HTTP 接口：

- `GET /`
  健康检查。
- `POST /review/webhook`
  GitLab Webhook 入口。

Webhook 处理规则：

- 仅支持 `merge_request` 和 `push`。
- MR 草稿状态不会触发 AI 审查，只发通知。
- 可选只审查受保护分支的 MR。
- 支持从环境变量、请求头或 payload 推断 GitLab 实例地址。
- 支持通过 `last_commit_id` 做 MR 去重，避免重复审查。

## 评审流程

### Merge Request

1. 接收 GitLab `merge_request` Webhook。
2. 拉取 MR changes 和 commits。
3. 过滤支持的文件类型并统计增删行。
4. 对 diff 做脱敏和 token 截断。
5. 调用 LLM 生成 Markdown 审查结果。
6. 将结果回写为 GitLab MR Note。
7. 发送 IM 通知并写入 SQLite。

### Push

1. 接收 GitLab `push` Webhook。
2. 根据 `before` / `after` 判断是普通 push、分支创建还是删除。
3. 使用 compare API 或 commit diff API 获取变更。
4. 执行 AI 审查并回写 Push Note。
5. 发送通知并写入 SQLite。

## 通知与持久化

- IM 通知渠道：
  - DingTalk
  - WeCom
  - Feishu
  - Extra Webhook
- SQLite 数据文件：
  - 默认路径：`data/data.db`
- 持久化字段：
  - 项目名、作者、分支、更新时间、提交信息、评分、评审结果、增删行数

## Prompt 与审查风格

- Prompt 文件：`conf/prompt_templates.yml`
- 风格配置：`REVIEW_STYLE`
- 可选风格：`professional`、`sarcastic`、`gentle`、`humorous`

当前默认 Prompt 偏向前端代码审查，重点关注：

- 正确性和潜在回归
- 状态管理与异步逻辑
- 可维护性
- 性能
- 安全与可访问性

如果你要扩展到后端或多语言项目，优先修改 Prompt 模板，而不是直接改业务流程。

## 开发说明

- 详细架构图见 [ARCHITECTURE.md](./ARCHITECTURE.md)
- 数据库初始化在启动阶段自动完成
- 配置检查会在启动时做 provider 和连通性校验
- 当前仓库未包含前端 Dashboard，重点是服务端评审链路

## 已知边界

- 当前 Webhook 入口面向 GitLab，不是 GitHub App / GitHub Webhook 方案。
- `sql.js` 适合轻量单机部署，不适合高并发多实例共享写入。
- 配置检查会尝试连接 LLM，离线环境下启动日志会出现连通性失败提示。
