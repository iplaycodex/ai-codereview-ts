import { MergeRequestHandler } from '../platforms/gitlab/merge-request';
import { PushHandler } from '../platforms/gitlab/push';
import { filterChanges } from '../platforms/gitlab/utils';
import { ReviewService } from '../service/review-service';
import CodeReviewer from '../review/reviewer';
import { MergeRequestReviewEntity, PushReviewEntity } from '../entity/review-entity';
import { eventManager } from '../events/event-manager';
import { sendNotification } from '../im/notifier';
import { config } from '../config';
import logger from '../logger';

export async function handleMergeRequestEvent(
  webhookData: Record<string, any>,
  gitlabToken: string,
  gitlabUrl: string,
  gitlabUrlSlug: string
): Promise<void> {
  try {
    const handler = new MergeRequestHandler(webhookData, gitlabToken, gitlabUrl);
    logger.info('Merge Request Hook event received');

    // Check draft/WIP
    const objectAttributes = webhookData.object_attributes || {};
    const isDraft = objectAttributes.draft || objectAttributes.work_in_progress;
    if (isDraft) {
      const msg = `[通知] MR为草稿（draft），未触发AI审查。\n项目: ${webhookData.project?.name}\n作者: ${webhookData.user?.username}\n源分支: ${objectAttributes.source_branch}\n目标分支: ${objectAttributes.target_branch}\n链接: ${objectAttributes.url}`;
      sendNotification(msg).catch(() => {});
      logger.info('MR为draft，仅发送通知，不触发AI review。');
      return;
    }

    // Check protected branches
    if (config.mergeReviewOnlyProtectedBranches && !(await handler.targetBranchProtected())) {
      logger.info('Merge Request target branch not match protected branches, ignored.');
      return;
    }

    // Check action
    const action = objectAttributes.action || '';
    if (!['open', 'update'].includes(action)) {
      logger.info(`Merge Request Hook event, action=${action}, ignored.`);
      return;
    }

    // Dedup by last_commit_id
    const lastCommitId = objectAttributes.last_commit?.id || '';
    if (lastCommitId) {
      const projectName = webhookData.project?.name;
      const sourceBranch = objectAttributes.source_branch || '';
      const targetBranch = objectAttributes.target_branch || '';
      if (ReviewService.getInstance().checkMrLastCommitIdExists(projectName, sourceBranch, targetBranch, lastCommitId)) {
        logger.info(`Merge Request with last_commit_id ${lastCommitId} already exists, skipping.`);
        return;
      }
    }

    // Get changes
    const rawChanges = await handler.getMergeRequestChanges();
    logger.info(`changes count: ${rawChanges?.length || 0}`);
    const { filteredChanges, additions: totalAdditions, deletions: totalDeletions } = filterChanges(rawChanges);
    if (!filteredChanges || filteredChanges.length === 0) {
      logger.info('未检测到有关代码的修改，修改文件可能不满足 SUPPORTED_EXTENSIONS。');
      return;
    }

    // Get commits
    const commitsText = await handler.getMergeRequestCommits();
    if (!commitsText) {
      logger.error('Failed to get commits');
      return;
    }

    // Review code
    const reviewer = new CodeReviewer();
    const reviewResult = await reviewer.reviewAndStripCode(JSON.stringify(filteredChanges), commitsText);

    // Post review as note
    await handler.addMergeRequestNotes(`Auto Review Result: \n${reviewResult}`);

    // Emit event
    const score = CodeReviewer.parseReviewScore(reviewResult);
    const entity: MergeRequestReviewEntity = {
      projectName: webhookData.project?.name,
      author: webhookData.user?.username,
      sourceBranch: objectAttributes.source_branch,
      targetBranch: objectAttributes.target_branch,
      updatedAt: Math.floor(Date.now() / 1000).toString(),
      commits: commitsText,
      score,
      url: objectAttributes.url,
      reviewResult,
      urlSlug: gitlabUrlSlug,
      webhookData,
      additions: totalAdditions,
      deletions: totalDeletions,
      lastCommitId,
    };
    eventManager.emit('merge_request_reviewed', entity);
  } catch (e) {
    const errorMsg = `AI Code Review 服务出现未知错误: ${(e as Error).message}\n${(e as Error).stack}`;
    sendNotification(errorMsg).catch(() => {});
    logger.error(errorMsg);
  }
}

export async function handlePushEvent(
  webhookData: Record<string, any>,
  gitlabToken: string,
  gitlabUrl: string,
  gitlabUrlSlug: string
): Promise<void> {
  try {
    const handler = new PushHandler(webhookData, gitlabToken, gitlabUrl);
    logger.info('Push Hook event received');

    const commitsText = handler.getPushCommits();
    if (!commitsText) {
      logger.error('Failed to get commits');
      return;
    }

    let reviewResult: string | null = null;
    let score: number | null = null;
    let additions = 0;
    let deletions = 0;

    if (config.pushReviewEnabled) {
      const pushChanges = await handler.getPushChanges();
      const { filteredChanges, additions: chAdditions, deletions: chDeletions } = filterChanges(pushChanges.changes);

      if (!filteredChanges || filteredChanges.length === 0) {
        logger.info('未检测到PUSH代码的修改，修改文件可能不满足 SUPPORTED_EXTENSIONS。');
        reviewResult = '关注的文件没有修改';
      } else {
        const reviewer = new CodeReviewer();
        reviewResult = await reviewer.reviewAndStripCode(JSON.stringify(filteredChanges), commitsText);
        score = CodeReviewer.parseReviewScore(reviewResult);
        additions = chAdditions;
        deletions = chDeletions;
      }

      if (reviewResult) {
        await handler.addPushNotes(`Auto Review Result: \n${reviewResult}`);
      }
    }

    // Emit event
    const entity: PushReviewEntity = {
      projectName: webhookData.project?.name,
      author: webhookData.user_username,
      branch: (webhookData.ref || '').replace('refs/heads/', ''),
      updatedAt: Math.floor(Date.now() / 1000).toString(),
      commits: commitsText,
      score,
      reviewResult: reviewResult || '',
      urlSlug: gitlabUrlSlug,
      webhookData,
      additions,
      deletions,
    };
    eventManager.emit('push_reviewed', entity);
  } catch (e) {
    const errorMsg = `服务出现未知错误: ${(e as Error).message}\n${(e as Error).stack}`;
    sendNotification(errorMsg).catch(() => {});
    logger.error(errorMsg);
  }
}
