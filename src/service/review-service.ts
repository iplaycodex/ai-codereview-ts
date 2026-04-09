import fs from 'fs';
import path from 'path';
import initSqlJs, { SqlJsDatabase } from 'sql.js';
import { config } from '../config';
import { MergeRequestReviewEntity, PushReviewEntity } from '../entity/review-entity';

type SqlValue = number | string | Uint8Array | null;

interface MrReviewLogRow {
  project_name: string;
  author: string;
  source_branch: string;
  target_branch: string;
  updated_at: string;
  commit_messages: string;
  score: number | null;
  url: string;
  review_result: string;
  additions: number;
  deletions: number;
  last_commit_id: string;
}

interface PushReviewLogRow {
  project_name: string;
  author: string;
  branch: string;
  updated_at: string;
  commit_messages: string;
  score: number | null;
  review_result: string;
  additions: number;
  deletions: number;
}

interface MrReviewLogFilter {
  authors?: string[];
  projectNames?: string[];
  updatedAtGte?: string;
  updatedAtLte?: string;
}

interface PushReviewLogFilter {
  authors?: string[];
  projectNames?: string[];
  updatedAtGte?: string;
  updatedAtLte?: string;
}

class ReviewService {
  private static instance: ReviewService;
  private db: SqlJsDatabase | null = null;

  private constructor() {}

  static getInstance(): ReviewService {
    if (!ReviewService.instance) {
      ReviewService.instance = new ReviewService();
    }
    return ReviewService.instance;
  }

  async initDb(): Promise<void> {
    const SQL = await initSqlJs();

    // Ensure the data directory exists
    const dbDir = path.dirname(config.dbFile);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    // Load existing database file if it exists
    if (fs.existsSync(config.dbFile)) {
      const buffer = fs.readFileSync(config.dbFile);
      this.db = new SQL.Database(buffer);
    } else {
      this.db = new SQL.Database();
    }

    // Create tables
    this.db!.run(`
      CREATE TABLE IF NOT EXISTS mr_review_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_name TEXT,
        author TEXT,
        source_branch TEXT,
        target_branch TEXT,
        updated_at TEXT,
        commit_messages TEXT,
        score INTEGER,
        url TEXT,
        review_result TEXT,
        additions INTEGER DEFAULT 0,
        deletions INTEGER DEFAULT 0,
        last_commit_id TEXT DEFAULT ''
      )
    `);

    this.db!.run(`
      CREATE TABLE IF NOT EXISTS push_review_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_name TEXT,
        author TEXT,
        branch TEXT,
        updated_at TEXT,
        commit_messages TEXT,
        score INTEGER,
        review_result TEXT,
        additions INTEGER DEFAULT 0,
        deletions INTEGER DEFAULT 0
      )
    `);

    // Auto column migration: ensure additions/deletions columns exist on both tables
    const tables = ['mr_review_log', 'push_review_log'];
    const commonColumns = [
      { name: 'additions', type: 'INTEGER', default: '0' },
      { name: 'deletions', type: 'INTEGER', default: '0' },
    ];

    for (const table of tables) {
      const currentColumns = this.getTableColumns(table);
      for (const col of commonColumns) {
        if (!currentColumns.includes(col.name)) {
          this.db!.run(
            `ALTER TABLE ${table} ADD COLUMN ${col.name} ${col.type} DEFAULT ${col.default}`
          );
        }
      }
    }

    // Ensure mr_review_log has last_commit_id column
    const mrColumns = this.getTableColumns('mr_review_log');
    if (!mrColumns.includes('last_commit_id')) {
      this.db!.run(
        `ALTER TABLE mr_review_log ADD COLUMN last_commit_id TEXT DEFAULT ''`
      );
    }

    // Create indexes on updated_at
    this.db!.run(
      'CREATE INDEX IF NOT EXISTS idx_mr_review_log_updated_at ON mr_review_log (updated_at)'
    );
    this.db!.run(
      'CREATE INDEX IF NOT EXISTS idx_push_review_log_updated_at ON push_review_log (updated_at)'
    );

    this.saveToDisk();
  }

  private getTableColumns(table: string): string[] {
    const results = this.db!.exec(`PRAGMA table_info(${table})`);
    if (results.length === 0) return [];
    // PRAGMA table_info returns columns: cid, name, type, notnull, dflt_value, pk
    return results[0].values.map((row: SqlValue[]) => row[1] as string);
  }

  private saveToDisk(): void {
    if (!this.db) return;
    const data = this.db.export();
    const buffer = Buffer.from(data);
    const dbDir = path.dirname(config.dbFile);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    fs.writeFileSync(config.dbFile, buffer);
  }

  insertMrReviewLog(entity: MergeRequestReviewEntity): void {
    if (!this.db) throw new Error('Database not initialized');

    this.db.run(
      `INSERT INTO mr_review_log (project_name, author, source_branch, target_branch,
        updated_at, commit_messages, score, url, review_result, additions, deletions,
        last_commit_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        entity.projectName,
        entity.author,
        entity.sourceBranch,
        entity.targetBranch,
        entity.updatedAt,
        entity.commits,
        entity.score,
        entity.url,
        entity.reviewResult,
        entity.additions,
        entity.deletions,
        entity.lastCommitId,
      ] as SqlValue[]
    );

    this.saveToDisk();
  }

  getMrReviewLogs(filters: MrReviewLogFilter = {}): MrReviewLogRow[] {
    if (!this.db) throw new Error('Database not initialized');

    const { authors, projectNames, updatedAtGte, updatedAtLte } = filters;

    let query = `
      SELECT project_name, author, source_branch, target_branch, updated_at,
        commit_messages, score, url, review_result, additions, deletions
      FROM mr_review_log
      WHERE 1=1
    `;
    const params: SqlValue[] = [];

    if (authors && authors.length > 0) {
      const placeholders = authors.map(() => '?').join(',');
      query += ` AND author IN (${placeholders})`;
      params.push(...authors);
    }

    if (projectNames && projectNames.length > 0) {
      const placeholders = projectNames.map(() => '?').join(',');
      query += ` AND project_name IN (${placeholders})`;
      params.push(...projectNames);
    }

    if (updatedAtGte !== undefined) {
      query += ' AND updated_at >= ?';
      params.push(updatedAtGte);
    }

    if (updatedAtLte !== undefined) {
      query += ' AND updated_at <= ?';
      params.push(updatedAtLte);
    }

    query += ' ORDER BY updated_at DESC';

    const results = this.db.exec(query, params);
    if (results.length === 0) return [];

    const columns = results[0].columns;
    return results[0].values.map((row: SqlValue[]) => {
      const obj: Record<string, SqlValue> = {};
      columns.forEach((col: string, i: number) => {
        obj[col] = row[i];
      });
      return obj as unknown as MrReviewLogRow;
    });
  }

  checkMrLastCommitIdExists(
    projectName: string,
    sourceBranch: string,
    targetBranch: string,
    lastCommitId: string
  ): boolean {
    if (!this.db) throw new Error('Database not initialized');

    const results = this.db.exec(
      `SELECT COUNT(*) FROM mr_review_log
       WHERE project_name = ? AND source_branch = ? AND target_branch = ? AND last_commit_id = ?`,
      [projectName, sourceBranch, targetBranch, lastCommitId] as SqlValue[]
    );

    if (results.length === 0) return false;
    const count = results[0].values[0][0] as number;
    return count > 0;
  }

  insertPushReviewLog(entity: PushReviewEntity): void {
    if (!this.db) throw new Error('Database not initialized');

    this.db.run(
      `INSERT INTO push_review_log (project_name, author, branch, updated_at,
        commit_messages, score, review_result, additions, deletions)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        entity.projectName,
        entity.author,
        entity.branch,
        entity.updatedAt,
        entity.commits,
        entity.score,
        entity.reviewResult,
        entity.additions,
        entity.deletions,
      ] as SqlValue[]
    );

    this.saveToDisk();
  }

  getPushReviewLogs(filters: PushReviewLogFilter = {}): PushReviewLogRow[] {
    if (!this.db) throw new Error('Database not initialized');

    const { authors, projectNames, updatedAtGte, updatedAtLte } = filters;

    let query = `
      SELECT project_name, author, branch, updated_at, commit_messages, score,
        review_result, additions, deletions
      FROM push_review_log
      WHERE 1=1
    `;
    const params: SqlValue[] = [];

    if (authors && authors.length > 0) {
      const placeholders = authors.map(() => '?').join(',');
      query += ` AND author IN (${placeholders})`;
      params.push(...authors);
    }

    if (projectNames && projectNames.length > 0) {
      const placeholders = projectNames.map(() => '?').join(',');
      query += ` AND project_name IN (${placeholders})`;
      params.push(...projectNames);
    }

    if (updatedAtGte !== undefined) {
      query += ' AND updated_at >= ?';
      params.push(updatedAtGte);
    }

    if (updatedAtLte !== undefined) {
      query += ' AND updated_at <= ?';
      params.push(updatedAtLte);
    }

    query += ' ORDER BY updated_at DESC';

    const results = this.db.exec(query, params);
    if (results.length === 0) return [];

    const columns = results[0].columns;
    return results[0].values.map((row: SqlValue[]) => {
      const obj: Record<string, SqlValue> = {};
      columns.forEach((col: string, i: number) => {
        obj[col] = row[i];
      });
      return obj as unknown as PushReviewLogRow;
    });
  }
}

// Export singleton instance
export const reviewService = ReviewService.getInstance();
export { ReviewService };
