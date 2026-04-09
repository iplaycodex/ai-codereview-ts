export interface MergeRequestReviewEntity {
  projectName: string;
  author: string;
  sourceBranch: string;
  targetBranch: string;
  updatedAt: string;
  commits: string;
  score: number | null;
  url: string;
  reviewResult: string;
  urlSlug: string;
  webhookData: unknown;
  additions: number;
  deletions: number;
  lastCommitId: string;
}

export interface PushReviewEntity {
  projectName: string;
  author: string;
  branch: string;
  updatedAt: string;
  commits: string;
  score: number | null;
  reviewResult: string;
  urlSlug: string;
  webhookData: unknown;
  additions: number;
  deletions: number;
}
