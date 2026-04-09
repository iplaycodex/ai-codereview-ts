import fs from 'fs';
import yaml from 'js-yaml';
import nunjucks from 'nunjucks';
import { config } from '../config';
import logger from '../logger';

export interface PromptPair {
  systemMessage: string;
  userMessage: string;
}

export function loadPrompts(style?: string): PromptPair {
  const effectiveStyle = style || config.reviewStyle;

  try {
    const fileContents = fs.readFileSync(config.promptTemplatesPath, 'utf-8');
    const doc = yaml.load(fileContents) as Record<string, Record<string, string>>;
    const prompts = doc['code_review_prompt'];

    if (!prompts) {
      throw new Error('code_review_prompt not found in prompt templates');
    }

    const systemPrompt = nunjucks.renderString(prompts['system_prompt'], { style: effectiveStyle });
    const userPrompt = nunjucks.renderString(prompts['user_prompt'], { style: effectiveStyle });

    return {
      systemMessage: systemPrompt,
      userMessage: userPrompt,
    };
  } catch (e) {
    logger.error(`Failed to load prompt templates: ${e}`);
    throw new Error(`Prompt template loading failed: ${e}`);
  }
}
