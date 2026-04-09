import axios from 'axios';
import { config } from '../config';
import logger from '../logger';

export class WeComNotifier {
  private enabled: boolean;
  private defaultWebhookUrl: string;

  constructor(webhookUrl?: string) {
    this.enabled = config.wecomEnabled;
    this.defaultWebhookUrl = webhookUrl || config.wecomWebhookUrl;
  }

  private getWebhookUrl(projectName?: string, urlSlug?: string): string {
    if (!projectName) {
      if (this.defaultWebhookUrl) return this.defaultWebhookUrl;
      throw new Error('未提供项目名称，且未设置默认的企业微信 Webhook URL。');
    }

    const targetKeyProject = `WECOM_WEBHOOK_URL_${projectName.toUpperCase()}`;
    const targetKeyUrlSlug = `WECOM_WEBHOOK_URL_${(urlSlug || '').toUpperCase()}`;

    for (const [key, value] of Object.entries(process.env)) {
      const upper = key.toUpperCase();
      if (upper === targetKeyProject || upper === targetKeyUrlSlug) {
        return value || '';
      }
    }

    if (this.defaultWebhookUrl) return this.defaultWebhookUrl;
    throw new Error(`未找到项目 '${projectName}' 对应的企业微信 Webhook URL`);
  }

  private formatMarkdownContent(content: string, title?: string): string {
    let formatted = title ? `## ${title}\n\n` : '';
    let processed = content;
    // Convert headings level 5+ to level 4
    processed = processed.replace(/#{5,}\s/g, '#### ');
    // Rewrite links: [text](url) → [链接](url)
    processed = processed.replace(/\[(.*?)\]\((.*?)\)/g, '[链接]($2)');
    // Strip HTML tags
    processed = processed.replace(/<[^>]+>/g, '');
    return formatted + processed;
  }

  private splitContent(content: string, maxBytes: number): string[] {
    const chunks: string[] = [];
    const contentBytes = Buffer.from(content, 'utf-8');
    let startPos = 0;

    while (startPos < contentBytes.length) {
      let endPos = Math.min(startPos + maxBytes, contentBytes.length);

      if (endPos >= contentBytes.length) {
        chunks.push(contentBytes.slice(startPos).toString('utf-8'));
        break;
      }

      // Walk back to find a newline boundary
      while (endPos > startPos && contentBytes[endPos - 1] !== 0x0a) {
        endPos--;
      }

      chunks.push(contentBytes.slice(startPos, endPos).toString('utf-8'));
      startPos = endPos;
    }

    return chunks;
  }

  private buildMessage(content: string, title: string | undefined, msgType: string, isAtAll: boolean) {
    if (msgType === 'markdown') {
      return {
        msgtype: 'markdown',
        markdown: { content: this.formatMarkdownContent(content, title) },
      };
    }
    return {
      msgtype: 'text',
      text: { content, mentioned_list: isAtAll ? ['@all'] : [] },
    };
  }

  async sendMessage(content: string, msgType = 'text', title?: string, isAtAll = false, projectName?: string, urlSlug?: string): Promise<void> {
    if (!this.enabled) {
      logger.info('企业微信推送未启用');
      return;
    }

    try {
      const postUrl = this.getWebhookUrl(projectName, urlSlug);
      const maxBytes = msgType === 'markdown' ? 4096 : 2048;
      const contentLength = Buffer.byteLength(content, 'utf-8');

      if (contentLength <= maxBytes) {
        const data = this.buildMessage(content, title, msgType, isAtAll);
        await this.sendRequest(postUrl, data);
      } else {
        logger.warn(`消息内容超过${maxBytes}字节限制，将分割发送。总长度: ${contentLength}字节`);
        const chunks = this.splitContent(content, maxBytes);
        for (let i = 0; i < chunks.length; i++) {
          const chunkTitle = title ? `${title} (第${i + 1}/${chunks.length}部分)` : `消息 (第${i + 1}/${chunks.length}部分)`;
          const data = this.buildMessage(chunks[i], chunkTitle, msgType, isAtAll);
          await this.sendRequest(postUrl, data, i + 1, chunks.length);
        }
      }
    } catch (e) {
      logger.error(`企业微信消息发送失败! ${(e as Error).message}`);
    }
  }

  private async sendRequest(url: string, data: unknown, chunkNum?: number, totalChunks?: number): Promise<void> {
    try {
      const label = chunkNum ? `分块 ${chunkNum}/${totalChunks}` : '';
      const response = await axios.post(url, data, {
        headers: { 'Content-Type': 'application/json' },
      });

      if (response.data?.errcode !== 0) {
        logger.error(`企业微信消息${label}发送失败! webhook_url:${url}, errmsg:${JSON.stringify(response.data)}`);
      } else {
        logger.info(`企业微信消息${label}发送成功! webhook_url:${url}`);
      }
    } catch (e) {
      logger.error(`企业微信消息发送请求失败! url:${url}, error: ${(e as Error).message}`);
    }
  }
}
