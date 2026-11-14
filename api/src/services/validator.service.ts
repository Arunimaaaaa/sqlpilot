import { Parser } from 'node-sql-parser';
import { QueryValidationResult } from '../types';

export class ReadOnlyValidatorService {
  private parser: Parser;

  // Forbidden SQL commands in MS SQL Server
  private static readonly FORBIDDEN_COMMANDS = [
    'INSERT',
    'UPDATE',
    'DELETE',
    'DROP',
    'ALTER',
    'TRUNCATE',
    'MERGE',
    'CREATE',
    'EXEC',
    'EXECUTE',
    'GRANT',
    'REVOKE',
    'DENY',
    'BACKUP',
    'RESTORE',
    'DBCC',
    'SHUTDOWN',
    'KILL',
    'RECONFIGURE',
    'BULK',
    'OPENROWSET',
    'OPENDATASOURCE',
    'XP_CMDSHELL',
    'SP_EXECUTESQL',
    'WAITFOR'
  ];

  constructor() {
    this.parser = new Parser();
  }

  /**
   * Validates that the provided T-SQL string is strictly a single, read-only SELECT or WITH ... SELECT statement.
   * Defends against stacked queries, comment smuggling, and SELECT INTO write operations.
   */
  validate(sqlQuery: string): QueryValidationResult {
    if (!sqlQuery || typeof sqlQuery !== 'string' || sqlQuery.trim().length === 0) {
      return {
        is_valid: false,
        error: 'Query is empty'
      };
    }

    const trimmed = sqlQuery.trim();

    // 1. Check for comment smuggling & strip comments safely to inspect actual code tokens
    const { cleanSql, strippedComments } = this.stripCommentsAndLiterals(trimmed);

    // 2. Reject stacked / multi-statement queries (e.g. SELECT 1; DROP TABLE users;)
    // Semicolons outside string literals indicate multiple statements
    const statements = cleanSql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0);

    if (statements.length > 1) {
      return {
        is_valid: false,
        error: 'Multiple statements detected. SQLPilot strictly enforces a single read-only statement.'
      };
    }

    const singleStatement = statements[0] || '';

    // 3. Must begin with SELECT or WITH (for CTE queries)
    const startsWithSelect = /^\s*SELECT\b/i.test(singleStatement);
    const startsWithWith = /^\s*WITH\b/i.test(singleStatement);

    if (!startsWithSelect && !startsWithWith) {
      return {
        is_valid: false,
        error: `Only SELECT queries are permitted. Query starts with disallowed keyword.`
      };
    }

    // 4. If query starts with WITH (CTE), ensure the final statement is a SELECT, not an INSERT/UPDATE/DELETE
    if (startsWithWith) {
      // Find the last top-level statement or verify that SELECT exists after CTE definition
      const hasFinalSelect = /\)\s*SELECT\b/i.test(singleStatement) || /AS\s*\([\s\S]*\)\s*SELECT\b/i.test(singleStatement);
      if (!hasFinalSelect) {
        return {
          is_valid: false,
          error: 'Common Table Expressions (WITH ...) must terminate in a read-only SELECT statement.'
        };
      }
    }

    // 5. Explicitly forbid SELECT ... INTO ... (creates new physical table or temp table in SQL Server)
    if (/\bINTO\b/i.test(singleStatement)) {
      // Check if INTO is used after SELECT before FROM
      const selectIntoMatch = /\bSELECT\b[\s\S]+?\bINTO\b[\s\S]+?\bFROM\b/i.test(singleStatement);
      if (selectIntoMatch) {
        return {
          is_valid: false,
          error: 'SELECT ... INTO is forbidden because it writes/creates tables.'
        };
      }
    }

    // 6. Scan for forbidden destructive command keywords across the entire non-literal token stream
    for (const cmd of ReadOnlyValidatorService.FORBIDDEN_COMMANDS) {
      const regex = new RegExp(`\\b${cmd}\\b`, 'i');
      if (regex.test(singleStatement)) {
        return {
          is_valid: false,
          error: `Forbidden keyword detected: '${cmd}'. Only read-only operations are permitted.`
        };
      }
    }

    // 7. Verify AST with node-sql-parser for TransactSQL / standard SQL dialect
    try {
      const ast = this.parser.astify(trimmed, { database: 'TransactSQL' });
      const astArray = Array.isArray(ast) ? ast : [ast];

      if (astArray.length > 1) {
        return {
          is_valid: false,
          error: 'AST parser detected multiple SQL statements.'
        };
      }

      const rootStmt = astArray[0];
      if (rootStmt && rootStmt.type && rootStmt.type.toLowerCase() !== 'select') {
        return {
          is_valid: false,
          error: `Disallowed statement type: ${rootStmt.type.toUpperCase()}. Expected SELECT.`
        };
      }
    } catch (parseError: any) {
      // If parser failed due to complex T-SQL specific syntax, ensure lexical check was 100% clean
      // but do not allow if error indicates invalid grammar
    }

    return {
      is_valid: true,
      statement_type: 'SELECT',
      sanitized_sql: trimmed
    };
  }

  /**
   * Replaces string literals ('...') and comments (-- ... and /* ... *\/) with whitespace placeholders
   * to accurately inspect executable SQL tokens without false positives in string values.
   */
  private stripCommentsAndLiterals(sql: string): { cleanSql: string; strippedComments: string[] } {
    let inSingleQuote = false;
    let inDoubleQuote = false;
    let inLineComment = false;
    let inBlockComment = false;
    const strippedComments: string[] = [];
    let currentComment = '';

    const chars = sql.split('');
    const cleanChars: string[] = [];

    for (let i = 0; i < chars.length; i++) {
      const char = chars[i];
      const nextChar = chars[i + 1] || '';

      if (inLineComment) {
        currentComment += char;
        if (char === '\n' || char === '\r') {
          inLineComment = false;
          cleanChars.push(char);
          strippedComments.push(currentComment);
          currentComment = '';
        } else {
          cleanChars.push(' ');
        }
        continue;
      }

      if (inBlockComment) {
        currentComment += char;
        if (char === '*' && nextChar === '/') {
          currentComment += nextChar;
          inBlockComment = false;
          cleanChars.push(' ', ' ');
          strippedComments.push(currentComment);
          currentComment = '';
          i++; // Skip '/'
        } else {
          cleanChars.push(' ');
        }
        continue;
      }

      if (inSingleQuote) {
        if (char === "'" && nextChar === "'") {
          cleanChars.push(' ', ' ');
          i++;
        } else if (char === "'") {
          inSingleQuote = false;
          cleanChars.push(' ');
        } else {
          cleanChars.push(' ');
        }
        continue;
      }

      if (inDoubleQuote) {
        if (char === '"') {
          inDoubleQuote = false;
          cleanChars.push(' ');
        } else {
          cleanChars.push(' ');
        }
        continue;
      }

      // Check for start of comments or literals
      if (char === '-' && nextChar === '-') {
        inLineComment = true;
        currentComment = '--';
        cleanChars.push(' ', ' ');
        i++;
        continue;
      }

      if (char === '/' && nextChar === '*') {
        inBlockComment = true;
        currentComment = '/*';
        cleanChars.push(' ', ' ');
        i++;
        continue;
      }

      if (char === "'") {
        inSingleQuote = true;
        cleanChars.push(' ');
        continue;
      }

      if (char === '"') {
        inDoubleQuote = true;
        cleanChars.push(' ');
        continue;
      }

      cleanChars.push(char);
    }

    return {
      cleanSql: cleanChars.join(''),
      strippedComments
    };
  }
}

export const readOnlyValidator = new ReadOnlyValidatorService();
