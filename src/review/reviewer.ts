import { config } from '../config';
import { Factory } from '../llm/factory';
import logger from '../logger';
import { getCodeSanitizer } from '../sanitizer/code-sanitizer';
import { countTokens, truncateText } from './token-util';
import { loadPrompts } from './prompt-loader';

class CodeReviewer {
  private prompts: ReturnType<typeof loadPrompts>;

  constructor() {
    this.prompts = loadPrompts();
  }

  async reviewAndStripCode(changesText: string, commitsText: string = ''): Promise<string> {
    if (!changesText) {
      logger.info(`Code is empty, diffs_text = ${changesText}`);
      return '代码为空';
    }

    // Sanitize if enabled
    if (config.sanitizerEnabled) {
      try {
        const sanitizer = getCodeSanitizer();
        changesText = sanitizer.sanitize(changesText);
        logger.info('Code has been sanitized');
      } catch (e) {
        logger.warn(`Sanitization failed, using original code: ${e}`);
      }
    }

    // Count tokens, truncate if over limit
    const tokensCount = countTokens(changesText);
    if (tokensCount > config.reviewMaxTokens) {
      changesText = truncateText(changesText, config.reviewMaxTokens);
    }

    let reviewResult = (await this.reviewCode(changesText, commitsText)).trim();

    // Strip markdown fences
    if (reviewResult.startsWith('```markdown') && reviewResult.endsWith('```')) {
      reviewResult = reviewResult.slice(11, -3).trim();
    }

    return reviewResult;
  }

  async reviewCode(diffsText: string, commitsText: string = ''): Promise<string> {
    const client = Factory.getClient();

    const messages = [
      { role: 'system' as const, content: this.prompts.systemMessage },
      {
        role: 'user' as const,
        content: this.prompts.userMessage
          .replace('{diffs_text}', diffsText)
          .replace('{commits_text}', commitsText),
      },
    ];

    logger.info(`Sending code review request to AI`);
    const reviewResult = await client.completions(messages);
    logger.info(`Received AI review result`);
    return reviewResult;
  }

  static parseReviewScore(text: string): number | null {
    if (!text) return null;
    const match = text.match(/总分[:：]\s*(\d+)分?/);
    return match ? parseInt(match[1], 10) : null;
  }
}

export default CodeReviewer;
