import axios from 'axios';
import https from 'https';
import { minimatch } from 'minimatch';
import { GitLabChange } from '../../types';
import logger from '../../logger';

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

export class MergeRequestHandler {
  private webhookData: any;
  private gitlabToken: string;
  private gitlabUrl: string;
  private eventType: string | null = null;
  private projectId: number | null = null;
  private mergeRequestIid: number | null = null;
  private action: string | null = null;

  constructor(webhookData: any, gitlabToken: string, gitlabUrl: string) {
    this.webhookData = webhookData;
    this.gitlabToken = gitlabToken;
    this.gitlabUrl = gitlabUrl;
    this.parseEventType();
  }

  /** Extract and store the event type from the webhook payload. */
  parseEventType(): string | null {
    this.eventType = this.webhookData.object_kind || null;
    if (this.eventType === 'merge_request') {
      this.parseMergeRequestEvent();
    }
    return this.eventType;
  }

  /** Parse merge-request specific fields from the webhook data. */
  parseMergeRequestEvent(): {
    projectId: number;
    mrIid: number;
    targetBranch: string;
    sourceBranch: string;
    author: string;
    title: string;
    url: string;
    lastCommitId: string;
    draft: boolean;
    action: string;
  } | null {
    const attrs = this.webhookData.object_attributes || {};
    const user = this.webhookData.user || {};
    const lastCommit =
      this.webhookData.object_attributes?.last_commit || {};

    this.mergeRequestIid = attrs.iid;
    this.projectId = attrs.target_project_id;
    this.action = attrs.action;

    return {
      projectId: attrs.target_project_id,
      mrIid: attrs.iid,
      targetBranch: attrs.target_branch,
      sourceBranch: attrs.source_branch,
      author: user.name || attrs.author?.name || '',
      title: attrs.title,
      url: attrs.url,
      lastCommitId: lastCommit.id || '',
      draft: !!attrs.draft || !!attrs.work_in_progress,
      action: attrs.action,
    };
  }

  /** Fetch the changes (diffs) for the merge request, retrying up to 3 times. */
  async getMergeRequestChanges(): Promise<GitLabChange[]> {
    if (this.eventType !== 'merge_request') {
      logger.warn(
        `Invalid event type: ${this.eventType}. Only 'merge_request' event is supported now.`,
      );
      return [];
    }

    const maxRetries = 3;
    const retryDelay = 10_000; // 10 seconds

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const url = `${this.gitlabUrl}/api/v4/projects/${this.projectId}/merge_requests/${this.mergeRequestIid}/changes?access_raw_diffs=true`;

      try {
        const response = await axios.get(url, {
          headers: { 'PRIVATE-TOKEN': this.gitlabToken },
          httpsAgent,
        });

        logger.debug(
          `Get changes response from GitLab (attempt ${attempt + 1}): ${response.status}, ${JSON.stringify(response.data).substring(0, 200)}, URL: ${url}`,
        );

        if (response.status === 200) {
          const changes = response.data.changes || [];
          if (changes.length > 0) {
            return changes;
          } else {
            logger.info(
              `Changes is empty, retrying in ${retryDelay / 1000} seconds... (attempt ${attempt + 1}/${maxRetries}), URL: ${url}`,
            );
            if (attempt < maxRetries - 1) {
              await this.sleep(retryDelay);
            }
          }
        } else {
          logger.warn(
            `Failed to get changes from GitLab (URL: ${url}): ${response.status}, ${JSON.stringify(response.data)}`,
          );
          return [];
        }
      } catch (error: any) {
        logger.warn(
          `Failed to get changes from GitLab (URL: ${url}): ${error.message}`,
        );
        return [];
      }
    }

    logger.warning(
      `Max retries (${maxRetries}) reached. Changes is still empty.`,
    );
    return [];
  }

  /** Fetch the commits for the merge request and return formatted strings. */
  async getMergeRequestCommits(): Promise<string> {
    if (this.eventType !== 'merge_request') {
      return '';
    }

    const url = `${this.gitlabUrl}/api/v4/projects/${this.projectId}/merge_requests/${this.mergeRequestIid}/commits`;

    try {
      const response = await axios.get(url, {
        headers: { 'PRIVATE-TOKEN': this.gitlabToken },
        httpsAgent,
      });

      logger.debug(
        `Get commits response from gitlab: ${response.status}, ${JSON.stringify(response.data).substring(0, 200)}`,
      );

      if (response.status === 200) {
        const commits = response.data;
        if (!Array.isArray(commits) || commits.length === 0) {
          return '';
        }
        return commits
          .map(
            (c: any) =>
              `commit ${c.short_id || c.id}\nAuthor: ${c.author_name}\n\n    ${c.title}\n`,
          )
          .join('\n');
      } else {
        logger.warn(
          `Failed to get commits: ${response.status}, ${JSON.stringify(response.data)}`,
        );
        return '';
      }
    } catch (error: any) {
      logger.warn(`Failed to get commits: ${error.message}`);
      return '';
    }
  }

  /** Post a review note on the merge request. */
  async addMergeRequestNotes(reviewResult: string): Promise<void> {
    const url = `${this.gitlabUrl}/api/v4/projects/${this.projectId}/merge_requests/${this.mergeRequestIid}/notes`;

    try {
      const response = await axios.post(
        url,
        { body: reviewResult },
        {
          headers: {
            'PRIVATE-TOKEN': this.gitlabToken,
            'Content-Type': 'application/json',
          },
          httpsAgent,
        },
      );

      logger.debug(
        `Add notes to gitlab ${url}: ${response.status}, ${JSON.stringify(response.data)}`,
      );

      if (response.status === 201) {
        logger.info('Note successfully added to merge request.');
      } else {
        logger.error(`Failed to add note: ${response.status}`);
        logger.error(JSON.stringify(response.data));
      }
    } catch (error: any) {
      logger.error(`Failed to add note: ${error.message}`);
    }
  }

  /** Check whether the target branch is a protected branch. */
  async targetBranchProtected(): Promise<boolean> {
    const url = `${this.gitlabUrl}/api/v4/projects/${this.projectId}/protected_branches`;

    try {
      const response = await axios.get(url, {
        headers: {
          'PRIVATE-TOKEN': this.gitlabToken,
          'Content-Type': 'application/json',
        },
        httpsAgent,
      });

      logger.debug(
        `Get protected branches response from gitlab: ${response.status}, ${JSON.stringify(response.data).substring(0, 200)}`,
      );

      if (response.status === 200) {
        const data = response.data;
        const targetBranch =
          this.webhookData.object_attributes?.target_branch;
        if (!targetBranch) return false;
        return data.some((item: any) =>
          minimatch(targetBranch, item.name),
        );
      } else {
        logger.warn(
          `Failed to get protected branches: ${response.status}, ${JSON.stringify(response.data)}`,
        );
        return false;
      }
    } catch (error: any) {
      logger.warn(`Failed to get protected branches: ${error.message}`);
      return false;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
