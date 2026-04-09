import axios from 'axios';
import { config } from '../config';
import logger from '../logger';

export class FeishuNotifier {
  private enabled: boolean;
  private defaultWebhookUrl: string;

  constructor(webhookUrl?: string) {
    this.enabled = config.feishuEnabled;
    this.defaultWebhookUrl = webhookUrl || config.feishuWebhookUrl;
  }

  private getWebhookUrl(projectName?: string, urlSlug?: string): string {
    if (!projectName) {
      if (this.defaultWebhookUrl) return this.defaultWebhookUrl;
      throw new Error('未提供项目名称，且未设置默认的飞书 Webhook URL。');
    }

    const targetKeyProject = `FEISHU_WEBHOOK_URL_${projectName.toUpperCase()}`;
    const targetKeyUrlSlug = `FEISHU_WEBHOOK_URL_${(urlSlug || '').toUpperCase()}`;

    for (const [key, value] of Object.entries(process.env)) {
      const upper = key.toUpperCase();
      if (upper === targetKeyProject || upper === targetKeyUrlSlug) {
        return value || '';
      }
    }

    if (this.defaultWebhookUrl) return this.defaultWebhookUrl;
    throw new Error(`未找到项目 '${projectName}' 对应的飞书 Webhook URL`);
  }

  async sendMessage(content: string, msgType = 'text', title?: string, isAtAll = false, projectName?: string, urlSlug?: string): Promise<void> {
    if (!this.enabled) {
      logger.info('飞书推送未启用');
      return;
    }

    try {
      const postUrl = this.getWebhookUrl(projectName, urlSlug);

      const data =
        msgType === 'markdown'
          ? {
              msg_type: 'interactive',
              card: {
                schema: '2.0',
                config: {
                  update_multi: true,
                  style: {
                    text_size: {
                      normal_v2: {
                        default: 'normal',
                        pc: 'normal',
                        mobile: 'heading',
                      },
                    },
                  },
                },
                body: {
                  direction: 'vertical',
                  padding: '12px 12px 12px 12px',
                  elements: [
                    {
                      tag: 'markdown',
                      content,
                      text_align: 'left',
                      text_size: 'normal_v2',
                      margin: '0px 0px 0px 0px',
                    },
                  ],
                },
                header: {
                  title: {
                    tag: 'plain_text',
                    content: title || '通知',
                  },
                  template: 'blue',
                  padding: '12px 12px 12px 12px',
                },
              },
            }
          : {
              msg_type: 'text',
              content: { text: content },
            };

      const response = await axios.post(postUrl, data, {
        headers: { 'Content-Type': 'application/json' },
      });

      if (response.status !== 200) {
        logger.error(`飞书消息发送失败! webhook_url:${postUrl}, error_msg:${response.data}`);
        return;
      }

      if (response.data?.msg !== 'success') {
        logger.error(`发送飞书消息失败! webhook_url:${postUrl}, errmsg:${JSON.stringify(response.data)}`);
      } else {
        logger.info(`飞书消息发送成功! webhook_url:${postUrl}`);
      }
    } catch (e) {
      logger.error(`飞书消息发送失败! ${(e as Error).message}`);
    }
  }
}
