declare module 'sql.js' {
  export type SqlValue = number | string | Uint8Array | null;

  export interface SqlJsStatic {
    Database: new (data?: ArrayLike<number | Buffer>) => SqlJsDatabase;
  }

  export interface SqlJsDatabase {
    run(sql: string, params?: SqlValue[]): SqlJsDatabase;
    exec(sql: string, params?: SqlValue[]): SqlJsResult[];
    export(): Uint8Array;
  }

  export interface SqlJsResult {
    columns: string[];
    values: SqlValue[][];
  }

  function initSqlJs(config?: Record<string, unknown>): Promise<SqlJsStatic>;
  export = initSqlJs;
}
