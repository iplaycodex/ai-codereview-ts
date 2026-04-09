import OpenAI from 'openai';
import { BaseClient } from './base-client';
import { CompletionMessage } from '../types';
import { config } from '../config';

export class QwenClient extends BaseClient {
  private client: OpenAI;
  private defaultModel: string;

  constructor() {
    super();
    this.client = new OpenAI({
      apiKey: config.qwenApiKey,
      baseURL: config.qwenApiBaseUrl,
    });
    this.defaultModel = config.qwenApiModel;
  }

  async completions(messages: CompletionMessage[], model?: string): Promise<string> {
    const response = await this.client.chat.completions.create(
      {
        model: model || this.defaultModel,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
      },
      {
        body: { enable_thinking: false },
      }
    );
    return response.choices[0]?.message?.content || '';
  }
}
