import axios from 'axios';
import { BaseClient } from './base-client';
import { CompletionMessage } from '../types';
import { config } from '../config';

export class ZhipuAIClient extends BaseClient {
  private apiKey: string;
  private defaultModel: string;

  constructor() {
    super();
    this.apiKey = config.zhipuaiApiKey;
    this.defaultModel = config.zhipuaiApiModel;
  }

  async completions(messages: CompletionMessage[], model?: string): Promise<string> {
    const response = await axios.post(
      'https://open.bigmodel.cn/api/paas/v4/chat/completions',
      {
        model: model || this.defaultModel,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
      },
      {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
      }
    );
    return response.data?.choices?.[0]?.message?.content || '';
  }
}
