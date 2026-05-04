// server/logger/db-logger.ts
// Wrapped Drizzle DB um alle Queries zu loggen

import { logger } from './index';

// Wrapper für DB-Operationen mit automatischem Logging
export function withDbLogging<T>(
  operation: () => Promise<T>,
  queryDescription: string
): Promise<T> {
  const start = Date.now();

  return operation()
    .then(result => {
      const duration = Date.now() - start;
      logger.dbQuery({
        query:    queryDescription,
        duration,
        rows:     Array.isArray(result) ? result.length : undefined,
      });
      return result;
    })
    .catch(error => {
      const duration = Date.now() - start;
      logger.dbQuery({
        query:    queryDescription,
        duration,
        error,
      });
      throw error; // Weiterwerfen – nicht schlucken!
    });
}

// SQLite PRAGMA für Query-Timing aktivieren
export function setupDbLogging(sqlite: any) {
  // Nur in Development: alle Queries tracen
  if (process.env.NODE_ENV !== 'production' && process.env.LOG_DB_QUERIES === 'true') {
    const originalPrepare = sqlite.prepare.bind(sqlite);

    sqlite.prepare = function(sql: string) {
      const stmt = originalPrepare(sql);
      const originalRun = stmt.run?.bind(stmt);
      const originalGet = stmt.get?.bind(stmt);
      const originalAll = stmt.all?.bind(stmt);

      if (originalRun) {
        stmt.run = function(...args: any[]) {
          const start = Date.now();
          const result = originalRun(...args);
          const duration = Date.now() - start;
          if (duration > 10) { // Nur Queries > 10ms loggen
            logger.dbQuery({ query: sql.slice(0, 150), duration });
          }
          return result;
        };
      }
      
      if (originalGet) {
        stmt.get = function(...args: any[]) {
          const start = Date.now();
          const result = originalGet(...args);
          const duration = Date.now() - start;
          if (duration > 10) {
            logger.dbQuery({ query: sql.slice(0, 150), duration });
          }
          return result;
        };
      }

      if (originalAll) {
        stmt.all = function(...args: any[]) {
          const start = Date.now();
          const result = originalAll(...args);
          const duration = Date.now() - start;
          if (duration > 10) {
            logger.dbQuery({ query: sql.slice(0, 150), duration });
          }
          return result;
        };
      }

      return stmt;
    };
  }
}
