import crypto from 'crypto';
import axios from 'axios';
import { config } from '../config';
import logger from '../logger';

export class DingTalkNotifier {
  private enabled: boolean;
  private defaultWebhookUrl: string;
  private secret?: string;

  constructor(webhookUrl?: string) {
    this.enabled = config.dingtalkEnabled;
    this.defaultWebhookUrl = webhookUrl || config.dingtalkWebhookUrl;
    this.secret = config.dingtalkSecret || undefined;
  }

  private generateSign(timestamp: number): string | null {
    if (!this.secret) return null;
    const stringToSign = `${timestamp}\n${this.secret}`;
    const hmac = crypto.createHmac('sha256', this.secret).update(stringToSign).digest('base64');
    return encodeURIComponent(hmac);
  }

  private getSignedUrl(baseUrl: string): string {
    if (!this.secret) return baseUrl;
    const timestamp = Date.now();
    const sign = this.generateSign(timestamp);
    const separator = baseUrl.includes('?') ? '&' : '?';
    return `${baseUrl}${separator}timestamp=${timestamp}&sign=${sign}`;
  }

  private getWebhookUrl(projectName?: string, urlSlug?: string): string {
    if (!projectName) {
      if (this.defaultWebhookUrl) return this.defaultWebhookUrl;
      throw new Error('未提供项目名称，且未设置默认的钉钉 Webhook URL。');
    }

    const targetKeyProject = `DINGTALK_WEBHOOK_URL_${projectName.toUpperCase()}`;
    const targetKeyUrlSlug = `DINGTALK_WEBHOOK_URL_${(urlSlug || '').toUpperCase()}`;

    for (const [key, value] of Object.entries(process.env)) {
      const upper = key.toUpperCase();
      if (upper === targetKeyProject || upper === targetKeyUrlSlug) {
        return value || '';
      }
    }

    if (this.defaultWebhookUrl) return this.defaultWebhookUrl;
    throw new Error(`未找到项目 '${projectName}' 对应的钉钉 Webhook URL`);
  }

  async sendMessage(content: string, msgType = 'text', title = '通知', isAtAll = false, projectName?: string, urlSlug?: string): Promise<void> {
    if (!this.enabled) {
      logger.info('钉钉推送未启用');
      return;
    }

    try {
      const baseUrl = this.getWebhookUrl(projectName, urlSlug);
      const postUrl = this.getSignedUrl(baseUrl);

      const message =
        msgType === 'markdown'
          ? {
              msgtype: 'markdown',
              markdown: { title, text: content },
              at: { isAtAll },
            }
          : {
              msgtype: 'text',
              text: { content },
              at: { isAtAll },
            };

      const response = await axios.post(postUrl, message, {
        headers: { 'Content-Type': 'application/json', Charset: 'UTF-8' },
      });

      if (response.data?.errmsg === 'ok') {
        logger.info(`钉钉消息发送成功! webhook_url:${postUrl}`);
      } else {
        logger.error(`钉钉消息发送失败! webhook_url:${postUrl}, errmsg:${response.data?.errmsg}`);
      }
    } catch (e) {
      logger.error(`钉钉消息发送失败! ${(e as Error).message}`);
    }
  }
}
