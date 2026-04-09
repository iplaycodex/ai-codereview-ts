import { DingTalkNotifier } from './dingtalk';
import { WeComNotifier } from './wecom';
import { FeishuNotifier } from './feishu';
import { ExtraWebhookNotifier } from './webhook';
import logger from '../logger';

export async function sendNotification(
  content: string,
  msgType = 'text',
  title = '通知',
  isAtAll = false,
  projectName?: string,
  urlSlug?: string,
  webhookData?: Record<string, unknown>
): Promise<void> {
  try {
    // DingTalk
    const dingtalk = new DingTalkNotifier();
    await dingtalk.sendMessage(content, msgType, title, isAtAll, projectName, urlSlug);

    // WeCom
    const wecom = new WeComNotifier();
    await wecom.sendMessage(content, msgType, title, isAtAll, projectName, urlSlug);

    // Feishu
    const feishu = new FeishuNotifier();
    await feishu.sendMessage(content, msgType, title, isAtAll, projectName, urlSlug);

    // Extra Webhook
    const extra = new ExtraWebhookNotifier();
    await extra.sendMessage(
      { content, msgType, title, projectName },
      webhookData || {}
    );
  } catch (e) {
    logger.error(`IM 通知发送失败! ${(e as Error).message}`);
  }
}
