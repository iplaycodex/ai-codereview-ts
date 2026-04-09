import { CompletionMessage } from '../types';

export abstract class BaseClient {
  abstract completions(messages: CompletionMessage[], model?: string): Promise<string>;

  async ping(): Promise<boolean> {
    try {
      await this.completions([{ role: 'user', content: 'ok' }]);
      return true;
    } catch {
      return false;
    }
  }
}
