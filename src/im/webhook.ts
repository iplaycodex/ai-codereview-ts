import axios from 'axios';
import { config } from '../config';
import logger from '../logger';

export class ExtraWebhookNotifier {
  private enabled: boolean;
  private webhookUrl: string;

  constructor(webhookUrl?: string) {
    this.enabled = config.extraWebhookEnabled;
    this.webhookUrl = webhookUrl || config.extraWebhookUrl;
  }

  async sendMessage(systemData: Record<string, unknown>, webhookData: Record<string, unknown>): Promise<void> {
    if (!this.enabled) {
      logger.info('ExtraWebhook 推送未启用');
      return;
    }

    try {
      await axios.post(
        this.webhookUrl,
        { ai_codereview_data: systemData, webhook_data: webhookData },
        { headers: { 'Content-Type': 'application/json' } }
      );
    } catch (e) {
      logger.error(`ExtraWebhook 消息发送失败! ${(e as Error).message}`);
    }
  }
}
