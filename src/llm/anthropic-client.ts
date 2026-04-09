import Anthropic from '@anthropic-ai/sdk';
import { BaseClient } from './base-client';
import { CompletionMessage } from '../types';
import { config } from '../config';

export class AnthropicClient extends BaseClient {
  private client: Anthropic;
  private defaultModel: string;
  private maxTokens: number;

  constructor() {
    super();
    this.client = new Anthropic({
      apiKey: config.anthropicApiKey,
      ...(config.anthropicApiBaseUrl ? { baseURL: config.anthropicApiBaseUrl } : {}),
    });
    this.defaultModel = config.anthropicApiModel;
    this.maxTokens = config.anthropicMaxTokens;
  }

  async completions(messages: CompletionMessage[], model?: string): Promise<string> {
    // Anthropic API requires system messages to be passed separately
    const systemMessages = messages
      .filter(m => m.role === 'system')
      .map(m => m.content)
      .join('\n');

    const nonSystemMessages = messages
      .filter(m => m.role !== 'system')
      .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    const response = await this.client.messages.create({
      model: model || this.defaultModel,
      max_tokens: this.maxTokens,
      ...(systemMessages ? { system: systemMessages } : {}),
      messages: nonSystemMessages,
    });

    const textBlock = response.content.find(block => block.type === 'text');
    return textBlock && 'text' in textBlock ? textBlock.text : '';
  }
}
