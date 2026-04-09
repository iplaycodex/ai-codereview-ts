import { Router, Request, Response } from 'express';
import { URL } from 'url';
import { slugifyUrl } from '../platforms/gitlab/utils';
import { handleMergeRequestEvent, handlePushEvent } from '../worker/handlers';
import { config } from '../config';
import logger from '../logger';

export function registerRoutes(app: import('express').Application): void {
  const router = Router();

  // Health check
  router.get('/', (_req: Request, res: Response) => {
    res.send(`<h2>The code review api server is running.</h2>
<p>GitHub project address: <a href="https://github.com/sunmh207/AI-Codereview-Gitlab" target="_blank">
https://github.com/sunmh207/AI-Codereview-Gitlab</a></p>`);
  });

  // Webhook endpoint - GitLab only
  router.post('/review/webhook', (req: Request, res: Response) => {
    const data = req.body;
    if (!data || typeof data !== 'object') {
      res.status(400).json({ error: 'Invalid JSON' });
      return;
    }

    const objectKind = data.object_kind;
    logger.info(`Received event: ${objectKind}`);

    // Resolve GitLab URL: env var → header → payload
    let gitlabUrl = config.gitlabUrl || req.headers['x-gitlab-instance'] as string;
    if (!gitlabUrl) {
      const homepage = data.repository?.homepage;
      if (!homepage) {
        res.status(400).json({ message: 'Missing GitLab URL' });
        return;
      }
      try {
        const parsed = new URL(homepage);
        gitlabUrl = `${parsed.protocol}//${parsed.host}/`;
      } catch (e) {
        res.status(400).json({ error: `Failed to parse homepage URL: ${(e as Error).message}` });
        return;
      }
    }

    // Resolve token: env var → header
    const gitlabToken = config.gitlabAccessToken || (req.headers['x-gitlab-token'] as string);
    if (!gitlabToken) {
      res.status(400).json({ message: 'Missing GitLab access token' });
      return;
    }

    const gitlabUrlSlug = slugifyUrl(gitlabUrl);

    if (objectKind === 'merge_request') {
      // Fire and forget - process asynchronously
      handleMergeRequestEvent(data, gitlabToken, gitlabUrl, gitlabUrlSlug).catch((e) => {
        logger.error(`MR handler error: ${(e as Error).message}`);
      });
      res.json({ message: `Request received(object_kind=${objectKind}), will process asynchronously.` });
    } else if (objectKind === 'push') {
      handlePushEvent(data, gitlabToken, gitlabUrl, gitlabUrlSlug).catch((e) => {
        logger.error(`Push handler error: ${(e as Error).message}`);
      });
      res.json({ message: `Request received(object_kind=${objectKind}), will process asynchronously.` });
    } else {
      const errorMsg = `Only merge_request and push events are supported, but received: ${objectKind}.`;
      logger.error(errorMsg);
      res.status(400).json({ error: errorMsg });
    }
  });

  app.use('/', router);
}
