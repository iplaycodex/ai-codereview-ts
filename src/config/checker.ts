import process from 'process';
import logger from '../logger';

const REQUIRED_ENV_VARS = ['LLM_PROVIDER'];

const LLM_PROVIDERS = new Set(['anthropic', 'zhipuai', 'openai', 'deepseek', 'ollama', 'qwen', 'codex']);

const LLM_REQUIRED_KEYS: Record<string, string[]> = {
  anthropic: ['ANTHROPIC_API_KEY', 'ANTHROPIC_API_BASE_URL', 'ANTHROPIC_API_MODEL'],
  zhipuai: ['ZHIPUAI_API_KEY', 'ZHIPUAI_API_MODEL'],
  openai: ['OPENAI_API_KEY', 'OPENAI_API_MODEL'],
  deepseek: ['DEEPSEEK_API_KEY', 'DEEPSEEK_API_MODEL'],
  ollama: ['OLLAMA_API_BASE_URL', 'OLLAMA_API_MODEL'],
  qwen: ['QWEN_API_KEY', 'QWEN_API_MODEL'],
  codex: [],  // Codex CLI 无需额外 env，依赖系统已安装 codex
};

function checkEnvVars(): void {
  const missing = REQUIRED_ENV_VARS.filter(v => !process.env[v]);
  if (missing.length > 0) {
    logger.warn(`⚠️ 缺少环境变量: ${missing.join(', ')}`);
  } else {
    logger.info('所有必要的环境变量均已设置。');
  }
}

function checkLlmProvider(): void {
  const provider = process.env['LLM_PROVIDER'];
  if (!provider) {
    logger.error('❌ LLM_PROVIDER 未设置！');
    return;
  }
  if (!LLM_PROVIDERS.has(provider)) {
    logger.error(`❌ LLM_PROVIDER 值错误，应为 ${[...LLM_PROVIDERS].join(', ')} 之一。`);
    return;
  }
  const requiredKeys = LLM_REQUIRED_KEYS[provider] || [];
  const missing = requiredKeys.filter(k => !process.env[k]);
  if (missing.length > 0) {
    logger.error(`❌ 当前 LLM 供应商为 ${provider}，但缺少必要的环境变量: ${missing.join(', ')}`);
  } else {
    logger.info(`LLM 供应商 ${provider} 的配置项已设置。`);
  }
}

async function checkLlmConnectivity(): Promise<void> {
  // Import dynamically to avoid circular dependency at module load
  const { Factory } = await import('../llm/factory');
  logger.info('正在检查 LLM 供应商的连接...');
  try {
    const client = Factory.getClient();
    const ok = await client.ping();
    if (ok) {
      logger.info('LLM 可以连接成功。');
    } else {
      logger.error('❌ LLM 连接可能有问题，请检查配置项。');
    }
  } catch (e) {
    logger.error(`❌ LLM 连接失败: ${(e as Error).message}`);
  }
}

export async function checkConfig(): Promise<void> {
  logger.info('开始检查配置项...');
  checkEnvVars();
  checkLlmProvider();
  await checkLlmConnectivity();
  logger.info('配置项检查完成。');
}
