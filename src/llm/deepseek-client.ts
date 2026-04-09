import OpenAI from 'openai';
import { BaseClient } from './base-client';
import { CompletionMessage } from '../types';
import { config } from '../config';
import logger from '../logger';

export class DeepSeekClient extends BaseClient {
  private client: OpenAI;
  private defaultModel: string;

  constructor() {
    super();
    this.client = new OpenAI({
      apiKey: config.deepseekApiKey,
      baseURL: config.deepseekApiBaseUrl,
    });
    this.defaultModel = config.deepseekApiModel;
  }

  async completions(messages: CompletionMessage[], model?: string): Promise<string> {
    try {
      const response = await this.client.chat.completions.create({
        model: model || this.defaultModel,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
      });
      return response.choices[0]?.message?.content || '';
    } catch (error: unknown) {
      const status = (error as { status?: number }).status;
      if (status === 401) {
        logger.error('❌ DeepSeek API 认证失败，请检查 API Key');
      } else if (status === 404) {
        logger.error('❌ DeepSeek API 模型不存在，请检查模型名称');
      }
      throw error;
    }
  }
}
