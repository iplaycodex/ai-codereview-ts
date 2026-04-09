export interface CompletionMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface GitLabChange {
  old_path: string;
  new_path: string;
  diff: string;
  new_file: boolean;
  deleted_file: boolean;
  renamed_file: boolean;
}

export interface GitLabCommit {
  id: string;
  message: string;
  author_name: string;
  added?: string[];
  modified?: string[];
  removed?: string[];
}

export interface WebhookData {
  [key: string]: unknown;
}
