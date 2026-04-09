import { config } from '../../config';
import { GitLabChange } from '../../types';

/**
 * Filter changes to only include supported file extensions and compute
 * addition/deletion line counts from the diff content.
 */
export function filterChanges(changes: GitLabChange[]): {
  filteredChanges: Array<{
    diff: string;
    new_path: string;
    additions: number;
    deletions: number;
  }>;
  additions: number;
  deletions: number;
} {
  const supportedExtensions = config.supportedExtensions.split(',');

  // Remove deleted files first
  const nonDeletedChanges = changes.filter(
    (change) => !change.deleted_file,
  );

  // Keep only changes whose new_path ends with a supported extension
  const filteredChanges = nonDeletedChanges
    .filter((change) =>
      supportedExtensions.some((ext) => change.new_path.endsWith(ext)),
    )
    .map((change) => {
      const diff = change.diff || '';
      const additions = (diff.match(/^\+(?!\+\+)/gm) || []).length;
      const deletions = (diff.match(/^-(?!--)/gm) || []).length;
      return {
        diff,
        new_path: change.new_path,
        additions,
        deletions,
      };
    });

  const totalAdditions = filteredChanges.reduce(
    (sum, c) => sum + c.additions,
    0,
  );
  const totalDeletions = filteredChanges.reduce(
    (sum, c) => sum + c.deletions,
    0,
  );

  return {
    filteredChanges,
    additions: totalAdditions,
    deletions: totalDeletions,
  };
}

/**
 * Convert a URL into a filesystem-safe string by stripping the scheme and
 * replacing non-alphanumeric characters with underscores.
 */
export function slugifyUrl(url: string): string {
  // Remove http:// or https:// prefix
  let result = url.replace(/^https?:\/\//, '');
  // Replace non-alphanumeric characters with underscores
  result = result.replace(/[^a-zA-Z0-9]/g, '_');
  // Strip trailing underscores
  result = result.replace(/_+$/, '');
  return result.toLowerCase();
}
