import { spawn } from 'child_process';
import { BaseClient } from './base-client';
import { CompletionMessage } from '../types';
import { config } from '../config';
import logger from '../logger';

export class CodexAgentClient extends BaseClient {
  private defaultModel: string;
  private timeout: number;

  constructor() {
    super();
    this.defaultModel = config.codexApiModel || 'o4-mini';
    this.timeout = (config.codexTimeout || 300) * 1000; // default 5 min
  }

  async completions(messages: CompletionMessage[], model?: string): Promise<string> {
    const prompt = this.buildPrompt(messages);
    const useModel = model || this.defaultModel;

    logger.info(`Codex Agent: 启动 review, model=${useModel}`);

    return new Promise((resolve, reject) => {
      const proc = spawn('codex', [
        'exec',
        '-m', useModel,
        '--skip-git-repo-check',
        '--json',
        prompt,
      ], {
        timeout: this.timeout,
        env: { ...process.env },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data: Buffer) => {
        stdout += data.toString('utf-8');
      });

      proc.stderr.on('data', (data: Buffer) => {
        stderr += data.toString('utf-8');
      });

      proc.on('close', (code) => {
        if (code === 0) {
          // Codex exec --json outputs JSONL; extract the last message content
          const result = this.extractLastMessage(stdout);
          if (result) {
            logger.info(`Codex Agent: review 完成, 输出 ${result.length} 字符`);
            resolve(result);
          } else {
            // Fallback: use raw stdout
            const raw = stdout.trim();
            if (raw) {
              resolve(raw);
            } else {
              reject(new Error('Codex Agent 返回空结果'));
            }
          }
        } else {
          logger.error(`Codex Agent 进程退出码: ${code}, stderr: ${stderr}`);
          reject(new Error(`Codex CLI exited with code ${code}: ${stderr}`));
        }
      });

      proc.on('error', (err) => {
        logger.error(`Codex Agent 启动失败: ${err.message}`);
        reject(err);
      });
    });
  }

  private extractLastMessage(stdout: string): string | null {
    // Codex exec --json outputs JSONL, one JSON object per line
    // We want the last message from the agent
    const lines = stdout.trim().split('\n').filter(l => l.trim());
    if (lines.length === 0) return null;

    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const obj = JSON.parse(lines[i]);
        // Look for message content in various Codex output formats
        if (obj.message?.content) return obj.message.content;
        if (obj.content) return obj.content;
        if (obj.text) return obj.text;
      } catch {
        // Not JSON, skip
      }
    }

    return null;
  }

  private buildPrompt(messages: CompletionMessage[]): string {
    const parts: string[] = [];

    for (const msg of messages) {
      if (msg.role === 'system') {
        parts.push(`[System Instruction]\n${msg.content}`);
      } else if (msg.role === 'user') {
        parts.push(msg.content);
      }
    }

    return parts.join('\n\n---\n\n');
  }
}
