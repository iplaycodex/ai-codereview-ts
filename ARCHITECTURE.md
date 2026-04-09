# ai-codereview-ts 架构图

## 系统架构总览

```mermaid
graph TB
    subgraph GitLab Platform
        GL_WH[GitLab Webhook]
        GL_API[GitLab API]
    end

    subgraph Service[Node.js / Express Service]
        ENTRY[index.ts<br/>启动入口]
        ROUTE[POST /review/webhook<br/>路由与参数解析]
        HANDLER[Worker Handlers<br/>MR / Push 编排]

        subgraph Review Pipeline
            ADAPTER[GitLab Adapter<br/>MR Changes / Compare / Notes]
            FILTER[变更过滤<br/>SUPPORTED_EXTENSIONS]
            REVIEWER[CodeReviewer]
            SANITIZER[CodeSanitizer]
            TOKEN[Token Count / Truncate]
            PROMPT[Prompt Loader<br/>YAML + Nunjucks]
            FACTORY[LLM Factory]
            PROVIDERS[OpenAI / DeepSeek / Anthropic / Qwen / ZhipuAI / Ollama / Codex]
        end

        subgraph Result Fanout
            EVENT[EventEmitter]
            NOTE[GitLab Note 回写]
            NOTIFY[IM Notifier]
            STORE[ReviewService]
        end

        subgraph Infra
            CONFIG[Env Config + Startup Check]
            LOG[Winston Logger]
            DB[(SQLite<br/>data/data.db)]
        end
    end

    GL_WH --> ROUTE
    ENTRY --> CONFIG
    ENTRY --> ROUTE
    ENTRY --> STORE
    ROUTE --> HANDLER

    HANDLER --> ADAPTER
    ADAPTER --> FILTER
    FILTER --> REVIEWER
    REVIEWER --> SANITIZER
    REVIEWER --> TOKEN
    REVIEWER --> PROMPT
    REVIEWER --> FACTORY
    FACTORY --> PROVIDERS

    HANDLER --> NOTE
    HANDLER --> EVENT
    ADAPTER --> GL_API
    NOTE --> GL_API

    EVENT --> NOTIFY
    EVENT --> STORE
    STORE --> DB

    ROUTE --> LOG
    HANDLER --> LOG
    ADAPTER --> LOG
    REVIEWER --> LOG
```

## Merge Request 审查流程

```mermaid
sequenceDiagram
    participant GL as GitLab
    participant API as POST /review/webhook
    participant H as handleMergeRequestEvent
    participant MR as MergeRequestHandler
    participant REV as CodeReviewer
    participant LLM as Selected LLM
    participant EVT as EventEmitter
    participant IM as IM Notifier
    participant DB as SQLite

    GL->>API: merge_request webhook
    API->>API: 解析 GitLab URL / Token / object_kind
    API-->>GL: 200 OK

    API->>H: 异步触发 MR 处理
    H->>H: 草稿 / action / 保护分支 / 去重检查
    H->>MR: 创建适配器
    MR->>GL: GET MR changes
    GL-->>MR: diff 数据
    MR->>GL: GET MR commits
    GL-->>MR: commit 列表

    H->>REV: reviewAndStripCode(filteredDiffs, commits)
    REV->>REV: 脱敏 / Token 统计 / 截断
    REV->>LLM: completions(messages)
    LLM-->>REV: Markdown review result
    REV-->>H: reviewResult + score

    H->>MR: addMergeRequestNotes()
    MR->>GL: POST MR note
    GL-->>MR: 201 Created

    H->>EVT: emit('merge_request_reviewed')
    EVT->>IM: sendNotification()
    EVT->>DB: insertMrReviewLog()
```

## Push 审查流程

```mermaid
sequenceDiagram
    participant GL as GitLab
    participant API as POST /review/webhook
    participant H as handlePushEvent
    participant PH as PushHandler
    participant REV as CodeReviewer
    participant LLM as Selected LLM
    participant EVT as EventEmitter
    participant DB as SQLite

    GL->>API: push webhook
    API-->>GL: 200 OK
    API->>H: 异步触发 Push 处理
    H->>PH: 创建适配器

    alt 新分支创建
        PH->>GL: GET commit diff(after)
        GL-->>PH: diff 数据
    else 普通 push
        PH->>GL: GET repository compare(before, after)
        GL-->>PH: compare diff 数据
    else 分支删除
        PH-->>H: 无需审查
    end

    H->>REV: reviewAndStripCode(filteredDiffs, commits)
    REV->>LLM: completions(messages)
    LLM-->>REV: review result
    REV-->>H: reviewResult + score

    H->>PH: addPushNotes()
    PH->>GL: POST commit / push note
    H->>EVT: emit('push_reviewed')
    EVT->>DB: insertPushReviewLog()
```

## 设计要点

- Webhook 接口快速返回，实际审查在后台异步执行，降低 GitLab 超时风险。
- `worker` 只负责流程编排，GitLab API、LLM、通知、存储都被拆到独立模块，便于替换和测试。
- Prompt、模型 Provider、文件过滤规则都在配置层可切换，不需要改主流程。
- 审查结果同时进入三条出口：GitLab Note、IM 通知、SQLite 日志，便于协作和追踪。
