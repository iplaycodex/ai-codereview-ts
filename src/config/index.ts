import path from 'path';
import dotenv from 'dotenv';

// Load .env before reading any env vars
dotenv.config({ path: path.resolve(process.cwd(), 'conf/.env') });

function getEnv(key: string, defaultValue?: string): string {
  const value = process.env[key];
  if (value === undefined) {
    if (defaultValue !== undefined) return defaultValue;
    return '';
  }
  return value;
}

function getEnvInt(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (value === undefined) return defaultValue;
  return parseInt(value, 10);
}

function getEnvBool(key: string, defaultValue: boolean): boolean {
  const value = process.env[key];
  if (value === undefined) return defaultValue;
  return value === '1' || value.toLowerCase() === 'true';
}

export const config = {
  // Server
  serverPort: getEnvInt('SERVER_PORT', 5001),
  tz: getEnv('TZ', 'Asia/Shanghai'),

  // LLM Provider
  llmProvider: getEnv('LLM_PROVIDER', 'deepseek'),

  // DeepSeek
  deepseekApiKey: getEnv('DEEPSEEK_API_KEY'),
  deepseekApiBaseUrl: getEnv('DEEPSEEK_API_BASE_URL', 'https://api.deepseek.com'),
  deepseekApiModel: getEnv('DEEPSEEK_API_MODEL', 'deepseek-chat'),

  // OpenAI
  openaiApiKey: getEnv('OPENAI_API_KEY'),
  openaiApiBaseUrl: getEnv('OPENAI_API_BASE_URL', 'https://api.openai.com/v1'),
  openaiApiModel: getEnv('OPENAI_API_MODEL', 'gpt-4o-mini'),

  // ZhipuAI
  zhipuaiApiKey: getEnv('ZHIPUAI_API_KEY'),
  zhipuaiApiModel: getEnv('ZHIPUAI_API_MODEL', 'GLM-4-Flash'),

  // Qwen
  qwenApiKey: getEnv('QWEN_API_KEY'),
  qwenApiBaseUrl: getEnv('QWEN_API_BASE_URL', 'https://dashscope.aliyuncs.com/compatible-mode/v1'),
  qwenApiModel: getEnv('QWEN_API_MODEL', 'qwen-coder-plus'),

  // Ollama
  ollamaApiBaseUrl: getEnv('OLLAMA_API_BASE_URL', 'http://127.0.0.1:11434'),
  ollamaApiModel: getEnv('OLLAMA_API_MODEL', 'deepseek-r1:latest'),

  // Anthropic
  anthropicApiKey: getEnv('ANTHROPIC_API_KEY'),
  anthropicApiBaseUrl: getEnv('ANTHROPIC_API_BASE_URL'),
  anthropicApiModel: getEnv('ANTHROPIC_API_MODEL', 'claude-sonnet-4-5-20250929'),
  anthropicMaxTokens: getEnvInt('ANTHROPIC_MAX_TOKENS', 4096),

  // Codex Agent (CLI)
  codexApiModel: getEnv('CODEX_API_MODEL', 'o4-mini'),
  codexTimeout: getEnvInt('CODEX_TIMEOUT', 300),

  // Review
  supportedExtensions: getEnv('SUPPORTED_EXTENSIONS', '.c,.cc,.cpp,.cs,.css,.cxx,.go,.h,.hh,.hpp,.hxx,.java,.js,.jsx,.md,.php,.py,.sql,.ts,.tsx,.vue,.yml'),
  reviewMaxTokens: getEnvInt('REVIEW_MAX_TOKENS', 10000),
  reviewStyle: getEnv('REVIEW_STYLE', 'professional'),

  // Sanitizer
  sanitizerEnabled: getEnvBool('SANITIZER_ENABLED', true),
  sanitizerKeywords: getEnv('SANITIZER_KEYWORDS'),
  sanitizeIp: getEnvBool('SANITIZE_IP', false),

  // IM - DingTalk
  dingtalkEnabled: getEnvBool('DINGTALK_ENABLED', false),
  dingtalkWebhookUrl: getEnv('DINGTALK_WEBHOOK_URL'),
  dingtalkSecret: getEnv('DINGTALK_SECRET'),

  // IM - WeCom
  wecomEnabled: getEnvBool('WECOM_ENABLED', false),
  wecomWebhookUrl: getEnv('WECOM_WEBHOOK_URL'),

  // IM - Feishu
  feishuEnabled: getEnvBool('FEISHU_ENABLED', false),
  feishuWebhookUrl: getEnv('FEISHU_WEBHOOK_URL'),

  // IM - Extra Webhook
  extraWebhookEnabled: getEnvBool('EXTRA_WEBHOOK_ENABLED', false),
  extraWebhookUrl: getEnv('EXTRA_WEBHOOK_URL'),

  // Logging
  logFile: getEnv('LOG_FILE', 'log/app.log'),
  logMaxBytes: getEnvInt('LOG_MAX_BYTES', 10485760),
  logBackupCount: getEnvInt('LOG_BACKUP_COUNT', 3),
  logLevel: getEnv('LOG_LEVEL', 'INFO'),

  // GitLab
  gitlabUrl: getEnv('GITLAB_URL'),
  gitlabAccessToken: getEnv('GITLAB_ACCESS_TOKEN'),

  // Feature flags
  pushReviewEnabled: getEnvBool('PUSH_REVIEW_ENABLED', true),
  mergeReviewOnlyProtectedBranches: getEnvBool('MERGE_REVIEW_ONLY_PROTECTED_BRANCHES_ENABLED', false),

  // Paths
  promptTemplatesPath: path.resolve(process.cwd(), 'conf/prompt_templates.yml'),
  dbFile: path.resolve(process.cwd(), 'data/data.db'),
} as const;
