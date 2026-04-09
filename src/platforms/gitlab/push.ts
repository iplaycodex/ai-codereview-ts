import axios from 'axios';
import https from 'https';
import { GitLabChange } from '../../types';
import { filterChanges } from './utils';
import logger from '../../logger';

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

export class PushHandler {
  private webhookData: any;
  private gitlabToken: string;
  private gitlabUrl: string;
  private eventType: string | null = null;
  private projectId: number | null = null;
  private branchName: string = '';
  private commitList: any[] = [];

  constructor(webhookData: any, gitlabToken: string, gitlabUrl: string) {
    this.webhookData = webhookData;
    this.gitlabToken = gitlabToken;
    this.gitlabUrl = gitlabUrl;
    this.parseEventType();
  }

  /** Extract and store the event type from the webhook payload. */
  parseEventType(): string | null {
    this.eventType = this.webhookData.event_name || null;
    if (this.eventType === 'push') {
      this.parsePushEvent();
    }
    return this.eventType;
  }

  /** Parse push-event specific fields from the webhook data. */
  parsePushEvent(): {
    ref: string;
    before: string;
    after: string;
    projectId: number;
    branchName: string;
    commits: any[];
  } | null {
    this.projectId =
      this.webhookData.project_id ??
      this.webhookData.project?.id ??
      null;
    this.branchName = (this.webhookData.ref || '').replace(
      'refs/heads/',
      '',
    );
    this.commitList = this.webhookData.commits || [];

    return {
      ref: this.webhookData.ref || '',
      before: this.webhookData.before || '',
      after: this.webhookData.after || '',
      projectId: this.projectId!,
      branchName: this.branchName,
      commits: this.commitList,
    };
  }

  /** Return formatted commit messages from the push event. */
  getPushCommits(): string {
    if (this.eventType !== 'push') {
      logger.warn(
        `Invalid event type: ${this.eventType}. Only 'push' event is supported now.`,
      );
      return '';
    }

    if (!this.commitList || this.commitList.length === 0) {
      return '';
    }

    const details = this.commitList.map((commit) => {
      const message = commit.message || '';
      const author = commit.author?.name || '';
      const timestamp = commit.timestamp || '';
      const url = commit.url || '';
      return `commit ${commit.id || ''}\nAuthor: ${author}\nDate: ${timestamp}\n\n    ${message.trim()}\n${url ? `URL: ${url}\n` : ''}`;
    });

    logger.info(
      `Collected ${details.length} commits from push event.`,
    );

    return details.join('\n');
  }

  /** Post a comment on the last commit of the push event. */
  async addPushNotes(message: string): Promise<void> {
    if (!this.commitList || this.commitList.length === 0) {
      logger.warn('No commits found to add notes to.');
      return;
    }

    const lastCommitId = this.commitList[this.commitList.length - 1]?.id;
    if (!lastCommitId) {
      logger.error('Last commit ID not found.');
      return;
    }

    const url = `${this.gitlabUrl}/api/v4/projects/${this.projectId}/repository/commits/${lastCommitId}/comments`;

    try {
      const response = await axios.post(
        url,
        { note: message },
        {
          headers: {
            'PRIVATE-TOKEN': this.gitlabToken,
            'Content-Type': 'application/json',
          },
          httpsAgent,
        },
      );

      logger.debug(
        `Add comment to commit ${lastCommitId}: ${response.status}, ${JSON.stringify(response.data)}`,
      );

      if (response.status === 201) {
        logger.info('Comment successfully added to push commit.');
      } else {
        logger.error(`Failed to add comment: ${response.status}`);
        logger.error(JSON.stringify(response.data));
      }
    } catch (error: any) {
      logger.error(`Failed to add comment: ${error.message}`);
    }
  }

  /** Compare two commits via the GitLab repository compare API. */
  async repositoryCompare(before: string, after: string): Promise<GitLabChange[]> {
    const url = `${this.gitlabUrl}/api/v4/projects/${this.projectId}/repository/compare?from=${before}&to=${after}`;

    try {
      const response = await axios.get(url, {
        headers: { 'PRIVATE-TOKEN': this.gitlabToken },
        httpsAgent,
      });

      logger.debug(
        `Get changes response from GitLab for repository_compare: ${response.status}, ${JSON.stringify(response.data).substring(0, 200)}, URL: ${url}`,
      );

      if (response.status === 200) {
        return response.data.diffs || [];
      } else {
        logger.warn(
          `Failed to get changes for repository_compare: ${response.status}, ${JSON.stringify(response.data)}`,
        );
        return [];
      }
    } catch (error: any) {
      logger.warn(
        `Failed to get changes for repository_compare: ${error.message}`,
      );
      return [];
    }
  }

  /** Get the diff for a single commit. */
  async getCommitDiff(commitSha: string): Promise<GitLabChange[]> {
    const url = `${this.gitlabUrl}/api/v4/projects/${this.projectId}/repository/commits/${commitSha}/diff`;

    try {
      const response = await axios.get(url, {
        headers: { 'PRIVATE-TOKEN': this.gitlabToken },
        httpsAgent,
      });

      logger.debug(
        `Get commit diff response from GitLab: ${response.status}, ${JSON.stringify(response.data).substring(0, 200)}, URL: ${url}`,
      );

      if (response.status === 200) {
        return response.data;
      } else {
        logger.warn(
          `Failed to get commit diff for ${commitSha}: ${response.status}, ${JSON.stringify(response.data)}`,
        );
        return [];
      }
    } catch (error: any) {
      logger.warn(
        `Failed to get commit diff for ${commitSha}: ${error.message}`,
      );
      return [];
    }
  }

  /**
   * Resolve changes for a push event.
   * Handles branch creation (before is all zeros), branch deletion (after is
   * all zeros), and normal push (uses the compare API).
   */
  async getPushChanges(): Promise<{
    changes: GitLabChange[];
    additions: number;
    deletions: number;
  }> {
    if (this.eventType !== 'push') {
      logger.warn(
        `Invalid event type: ${this.eventType}. Only 'push' event is supported now.`,
      );
      return { changes: [], additions: 0, deletions: 0 };
    }

    if (!this.commitList || this.commitList.length === 0) {
      logger.info('No commits found in push event.');
      return { changes: [], additions: 0, deletions: 0 };
    }

    const before = this.webhookData.before || '';
    const after = this.webhookData.after || '';

    if (!before || !after) {
      logger.warn('Missing before or after commit SHA in webhook data.');
      return { changes: [], additions: 0, deletions: 0 };
    }

    if (after.startsWith('0000000')) {
      // Branch deletion
      logger.info('Branch deletion detected, no changes to review.');
      return { changes: [], additions: 0, deletions: 0 };
    }

    let rawChanges: GitLabChange[];

    if (before.startsWith('0000000')) {
      // Branch creation - use the single commit diff API
      logger.info('New branch creation detected, using commit diff API.');
      rawChanges = await this.getCommitDiff(after);
    } else {
      // Normal push - use the compare API
      logger.info(`Comparing commits from ${before} to ${after}`);
      rawChanges = await this.repositoryCompare(before, after);
    }

    const { filteredChanges, additions, deletions } =
      filterChanges(rawChanges);

    return {
      changes: rawChanges,
      additions,
      deletions,
    };
  }
}
