import { BaseClient } from './base-client';
import { OpenAIClient } from './openai-client';
import { DeepSeekClient } from './deepseek-client';
import { AnthropicClient } from './anthropic-client';
import { QwenClient } from './qwen-client';
import { ZhipuAIClient } from './zhipuai-client';
import { OllamaClient } from './ollama-client';
import { CodexAgentClient } from './codex-agent-client';
import { config } from '../config';

export class Factory {
  static getClient(provider?: string): BaseClient {
    const p = provider || config.llmProvider;
    switch (p) {
      case 'openai':
        return new OpenAIClient();
      case 'deepseek':
        return new DeepSeekClient();
      case 'anthropic':
        return new AnthropicClient();
      case 'qwen':
        return new QwenClient();
      case 'zhipuai':
        return new ZhipuAIClient();
      case 'ollama':
        return new OllamaClient();
      case 'codex':
        return new CodexAgentClient();
      default:
        throw new Error(`不支持的 LLM 提供商: ${p}`);
    }
  }
}
