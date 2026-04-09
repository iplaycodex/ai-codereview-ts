import { EventEmitter } from 'events';
import { MergeRequestReviewEntity, PushReviewEntity } from '../entity/review-entity';
import { sendNotification } from '../im/notifier';
import { ReviewService } from '../service/review-service';
import logger from '../logger';

export const eventManager = new EventEmitter();

function onMergeRequestReviewed(entity: MergeRequestReviewEntity): void {
  const commitMessages = entity.commits;
  const imMsg = `### 🔀 ${entity.projectName}: Merge Request

#### 合并请求信息:
- **提交者:** ${entity.author}
- **源分支**: ${entity.sourceBranch}
- **目标分支**: ${entity.targetBranch}
- **更新时间**: ${entity.updatedAt}
- **提交信息:** ${commitMessages}
- [查看合并详情](${entity.url})
- **AI Review 结果:**

${entity.reviewResult}`;

  sendNotification(
    imMsg,
    'markdown',
    'Merge Request Review',
    false,
    entity.projectName,
    entity.urlSlug,
    entity.webhookData as Record<string, unknown>
  ).catch((e) => logger.error(`MR 事件通知失败: ${(e as Error).message}`));

  ReviewService.getInstance().insertMrReviewLog(entity);
}

function onPushReviewed(entity: PushReviewEntity): void {
  let imMsg = `### 🚀 ${entity.projectName}: Push\n\n`;
  imMsg += '#### 提交记录:\n';

  try {
    const commits = typeof entity.commits === 'string' ? JSON.parse(entity.commits) : entity.commits;
    if (Array.isArray(commits)) {
      for (const commit of commits) {
        const message = (commit.message || '').trim();
        const author = commit.author || 'Unknown Author';
        const timestamp = commit.timestamp || '';
        const url = commit.url || '#';
        imMsg += `- **提交信息**: ${message}\n- **提交者**: ${author}\n- **时间**: ${timestamp}\n- [查看提交详情](${url})\n\n`;
      }
    }
  } catch {
    imMsg += `- ${entity.commits}\n`;
  }

  if (entity.reviewResult) {
    imMsg += `#### AI Review 结果: \n ${entity.reviewResult}\n\n`;
  }

  sendNotification(
    imMsg,
    'markdown',
    `${entity.projectName} Push Event`,
    false,
    entity.projectName,
    entity.urlSlug,
    entity.webhookData as Record<string, unknown>
  ).catch((e) => logger.error(`Push 事件通知失败: ${(e as Error).message}`));

  ReviewService.getInstance().insertPushReviewLog(entity);
}

// Register event handlers
eventManager.on('merge_request_reviewed', onMergeRequestReviewed);
eventManager.on('push_reviewed', onPushReviewed);
