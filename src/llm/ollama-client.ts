import { BaseClient } from './base-client';
import { CompletionMessage } from '../types';
import { config } from '../config';
import logger from '../logger';

export class OllamaClient extends BaseClient {
  private baseUrl: string;
  private defaultModel: string;

  constructor() {
    super();
    this.baseUrl = config.ollamaApiBaseUrl;
    this.defaultModel = config.ollamaApiModel;
  }

  private extractContent(content: string): string {
    const openPattern = /<think/i;
    const closePattern = /<\/think[^>]*>/i;

    const hasOpen = openPattern.test(content);
    const hasClose = closePattern.test(content);

    if (hasOpen && !hasClose) {
      // Chain of thought was aborted
      logger.debug('检测到 Ollama COT 标签未关闭，返回截断提示');
      return 'COT ABORT!';
    }

    if (!hasOpen && hasClose) {
      // Only closing tag: return content after it
      const closeIdx = content.search(closePattern);
      const afterClose = closeIdx + content.substring(closeIdx).indexOf('>') + 1;
      return content.substring(afterClose).trim();
    }

    if (hasOpen && hasClose) {
      // Both tags present: strip the thinking section
      return content.replace(/<think[\s\S]*?<\/think[^>]*>/gi, '').trim();
    }

    return content;
  }

  async completions(messages: CompletionMessage[], model?: string): Promise<string> {
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model || this.defaultModel,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        stream: false,
      }),
    });

    const data = (await response.json()) as { message?: { content?: string } };
    const raw = data?.message?.content || '';
    return this.extractContent(raw);
  }
}
