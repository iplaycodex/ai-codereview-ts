import { encodingForModel } from 'js-tiktoken';

const encoding = encodingForModel('gpt-4o');

export function countTokens(text: string): number {
  return encoding.encode(text).length;
}

export function truncateText(text: string, maxTokens: number): string {
  const tokens = encoding.encode(text);

  if (tokens.length > maxTokens) {
    const truncatedTokens = tokens.slice(0, maxTokens);
    return encoding.decode(truncatedTokens) as string;
  }

  return text;
}
