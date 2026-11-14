import sql from 'mssql';
import { poolManager } from './pool';
import {
  User,
  ConnectionRecord,
  QueryHistoryRecord,
  SavedSnippet,
  MissingIndexRecommendation
} from '../types';

export class MetadataStore {
  // Fallback in-memory storage for local dev / when SQL Server container is offline or starting
  private memoryUsers: Map<number, User> = new Map();
  private memoryConnections: Map<number, ConnectionRecord> = new Map();
  private memorySchemaCache: Map<number, { schema_json: string; refreshed_at: string }> = new Map();
  private memoryHistory: QueryHistoryRecord[] = [];
  private memorySnippets: SavedSnippet[] = [];
  private memoryIndexRecs: MissingIndexRecommendation[] = [];

  private nextUserId = 1;
  private nextConnId = 1;
  private nextHistId = 1;
  private nextSnipId = 1;
  private nextRecId = 1;

  constructor() {
    this.seedDefaultMockData();
  }

  private seedDefaultMockData() {
    // Seed sample connection record for local dev testing
    const sampleConn: ConnectionRecord = {
      id: 1,
      user_id: 1,
      name: 'Local AdventureStore (Docker)',
      server_host: 'localhost',
      port: 1433,
      database_name: 'AdventureStore',
      login_username: 'sqlpilot_readonly',
      secret_ref: 'arn:aws:secretsmanager:us-east-1:sqlpilot:secret/local-adventure-01',
      is_read_only: true,
      created_at: new Date().toISOString()
    };
    this.memoryConnections.set(1, sampleConn);
    this.nextConnId = 2;
  }

  // ================= USERS =================
  async createUser(email: string, passwordHash: string): Promise<User> {
    const pool = await poolManager.getMetadataPool();
    if (pool) {
      const result = await pool.request()
        .input('email', sql.NVarChar(255), email)
        .input('password_hash', sql.NVarChar(255), passwordHash)
        .query(`
          INSERT INTO users (email, password_hash)
          OUTPUT INSERTED.id, INSERTED.email, INSERTED.password_hash, INSERTED.created_at
          VALUES (@email, @password_hash);
        `);
      return result.recordset[0];
    }

    // Memory fallback
    for (const u of this.memoryUsers.values()) {
      if (u.email.toLowerCase() === email.toLowerCase()) {
        throw new Error('User with this email already exists');
      }
    }
    const user: User = {
      id: this.nextUserId++,
      email,
      password_hash: passwordHash,
      created_at: new Date().toISOString()
    };
    this.memoryUsers.set(user.id, user);
    return user;
  }

  async findUserByEmail(email: string): Promise<User | null> {
    const pool = await poolManager.getMetadataPool();
    if (pool) {
      const result = await pool.request()
        .input('email', sql.NVarChar(255), email)
        .query('SELECT TOP 1 * FROM users WHERE email = @email');
      return result.recordset[0] || null;
    }

    for (const u of this.memoryUsers.values()) {
      if (u.email.toLowerCase() === email.toLowerCase()) return u;
    }
    return null;
  }

  async findUserById(id: number): Promise<User | null> {
    const pool = await poolManager.getMetadataPool();
    if (pool) {
      const result = await pool.request()
        .input('id', sql.Int, id)
        .query('SELECT TOP 1 * FROM users WHERE id = @id');
      return result.recordset[0] || null;
    }
    return this.memoryUsers.get(id) || null;
  }

  // ================= CONNECTIONS =================
  async createConnection(
    userId: number,
    data: {
      name: string;
      server_host: string;
      port: number;
      database_name: string;
      login_username: string;
      secret_ref: string;
      is_read_only: boolean;
    }
  ): Promise<ConnectionRecord> {
    const pool = await poolManager.getMetadataPool();
    if (pool) {
      const result = await pool.request()
        .input('user_id', sql.Int, userId)
        .input('name', sql.NVarChar(100), data.name)
        .input('server_host', sql.NVarChar(255), data.server_host)
        .input('port', sql.Int, data.port)
        .input('database_name', sql.NVarChar(128), data.database_name)
        .input('login_username', sql.NVarChar(128), data.login_username)
        .input('secret_ref', sql.NVarChar(255), data.secret_ref)
        .input('is_read_only', sql.Bit, data.is_read_only ? 1 : 0)
        .query(`
          INSERT INTO connections (user_id, name, server_host, port, database_name, login_username, secret_ref, is_read_only)
          OUTPUT INSERTED.*
          VALUES (@user_id, @name, @server_host, @port, @database_name, @login_username, @secret_ref, @is_read_only);
        `);
      return result.recordset[0];
    }

    const conn: ConnectionRecord = {
      id: this.nextConnId++,
      user_id: userId,
      ...data,
      created_at: new Date().toISOString()
    };
    this.memoryConnections.set(conn.id, conn);
    return conn;
  }

  async listConnections(userId: number): Promise<ConnectionRecord[]> {
    const pool = await poolManager.getMetadataPool();
    if (pool) {
      const result = await pool.request()
        .input('user_id', sql.Int, userId)
        .query('SELECT * FROM connections WHERE user_id = @user_id ORDER BY id DESC');
      return result.recordset;
    }

    return Array.from(this.memoryConnections.values()).filter(c => c.user_id === userId);
  }

  async getConnectionById(userId: number, id: number): Promise<ConnectionRecord | null> {
    const pool = await poolManager.getMetadataPool();
    if (pool) {
      const result = await pool.request()
        .input('user_id', sql.Int, userId)
        .input('id', sql.Int, id)
        .query('SELECT TOP 1 * FROM connections WHERE id = @id AND user_id = @user_id');
      return result.recordset[0] || null;
    }

    const conn = this.memoryConnections.get(id);
    if (conn && conn.user_id === userId) return conn;
    return null;
  }

  async deleteConnection(userId: number, id: number): Promise<boolean> {
    const pool = await poolManager.getMetadataPool();
    if (pool) {
      const result = await pool.request()
        .input('user_id', sql.Int, userId)
        .input('id', sql.Int, id)
        .query('DELETE FROM connections WHERE id = @id AND user_id = @user_id');
      return (result.rowsAffected[0] || 0) > 0;
    }

    const conn = this.memoryConnections.get(id);
    if (conn && conn.user_id === userId) {
      this.memoryConnections.delete(id);
      this.memorySchemaCache.delete(id);
      return true;
    }
    return false;
  }

  // ================= SCHEMA CACHE =================
  async saveSchemaCache(connectionId: number, schemaJson: string): Promise<void> {
    const pool = await poolManager.getMetadataPool();
    if (pool) {
      await pool.request()
        .input('connection_id', sql.Int, connectionId)
        .input('schema_json', sql.NVarChar(sql.MAX), schemaJson)
        .query(`
          MERGE schema_cache AS target
          USING (SELECT @connection_id AS connection_id, @schema_json AS schema_json) AS src
          ON (target.connection_id = src.connection_id)
          WHEN MATCHED THEN
              UPDATE SET schema_json = src.schema_json, refreshed_at = SYSUTCDATETIME()
          WHEN NOT MATCHED THEN
              INSERT (connection_id, schema_json, refreshed_at)
              VALUES (src.connection_id, src.schema_json, SYSUTCDATETIME());
        `);
      return;
    }

    this.memorySchemaCache.set(connectionId, {
      schema_json: schemaJson,
      refreshed_at: new Date().toISOString()
    });
  }

  async getSchemaCache(connectionId: number): Promise<{ schema_json: string; refreshed_at: string } | null> {
    const pool = await poolManager.getMetadataPool();
    if (pool) {
      const result = await pool.request()
        .input('connection_id', sql.Int, connectionId)
        .query('SELECT TOP 1 schema_json, refreshed_at FROM schema_cache WHERE connection_id = @connection_id');
      return result.recordset[0] || null;
    }

    return this.memorySchemaCache.get(connectionId) || null;
  }

  // ================= QUERY HISTORY =================
  async addQueryHistory(
    userId: number,
    connectionId: number,
    data: {
      nl_prompt: string | null;
      generated_sql: string;
      status: 'SUCCESS' | 'ERROR' | 'REJECTED';
      row_count?: number;
      duration_ms?: number;
      error?: string;
    }
  ): Promise<QueryHistoryRecord> {
    const pool = await poolManager.getMetadataPool();
    if (pool) {
      const result = await pool.request()
        .input('user_id', sql.Int, userId)
        .input('connection_id', sql.Int, connectionId)
        .input('nl_prompt', sql.NVarChar(sql.MAX), data.nl_prompt)
        .input('generated_sql', sql.NVarChar(sql.MAX), data.generated_sql)
        .input('status', sql.NVarChar(50), data.status)
        .input('row_count', sql.Int, data.row_count ?? null)
        .input('duration_ms', sql.Int, data.duration_ms ?? null)
        .input('error', sql.NVarChar(sql.MAX), data.error ?? null)
        .query(`
          INSERT INTO query_history (user_id, connection_id, nl_prompt, generated_sql, status, row_count, duration_ms, error)
          OUTPUT INSERTED.*
          VALUES (@user_id, @connection_id, @nl_prompt, @generated_sql, @status, @row_count, @duration_ms, @error);
        `);
      return result.recordset[0];
    }

    const rec: QueryHistoryRecord = {
      id: this.nextHistId++,
      user_id: userId,
      connection_id: connectionId,
      nl_prompt: data.nl_prompt,
      generated_sql: data.generated_sql,
      status: data.status,
      row_count: data.row_count ?? null,
      duration_ms: data.duration_ms ?? null,
      error: data.error ?? null,
      created_at: new Date().toISOString()
    };
    this.memoryHistory.unshift(rec);
    return rec;
  }

  async listQueryHistory(userId: number, connectionId?: number): Promise<QueryHistoryRecord[]> {
    const pool = await poolManager.getMetadataPool();
    if (pool) {
      const req = pool.request().input('user_id', sql.Int, userId);
      let query = 'SELECT TOP 100 * FROM query_history WHERE user_id = @user_id';
      if (connectionId) {
        req.input('connection_id', sql.Int, connectionId);
        query += ' AND connection_id = @connection_id';
      }
      query += ' ORDER BY created_at DESC';
      const result = await req.query(query);
      return result.recordset;
    }

    return this.memoryHistory
      .filter(h => h.user_id === userId && (!connectionId || h.connection_id === connectionId))
      .slice(0, 100);
  }

  // ================= SAVED SNIPPETS =================
  async saveSnippet(
    userId: number,
    connectionId: number,
    data: { title: string; sql_text: string; notes?: string }
  ): Promise<SavedSnippet> {
    const pool = await poolManager.getMetadataPool();
    if (pool) {
      const result = await pool.request()
        .input('user_id', sql.Int, userId)
        .input('connection_id', sql.Int, connectionId)
        .input('title', sql.NVarChar(255), data.title)
        .input('sql_text', sql.NVarChar(sql.MAX), data.sql_text)
        .input('notes', sql.NVarChar(sql.MAX), data.notes || null)
        .query(`
          INSERT INTO saved_snippets (user_id, connection_id, title, sql_text, notes)
          OUTPUT INSERTED.*
          VALUES (@user_id, @connection_id, @title, @sql_text, @notes);
        `);
      return result.recordset[0];
    }

    const snippet: SavedSnippet = {
      id: this.nextSnipId++,
      user_id: userId,
      connection_id: connectionId,
      title: data.title,
      sql_text: data.sql_text,
      notes: data.notes || null,
      created_at: new Date().toISOString()
    };
    this.memorySnippets.unshift(snippet);
    return snippet;
  }

  async listSnippets(userId: number, connectionId?: number): Promise<SavedSnippet[]> {
    const pool = await poolManager.getMetadataPool();
    if (pool) {
      const req = pool.request().input('user_id', sql.Int, userId);
      let query = 'SELECT * FROM saved_snippets WHERE user_id = @user_id';
      if (connectionId) {
        req.input('connection_id', sql.Int, connectionId);
        query += ' AND connection_id = @connection_id';
      }
      query += ' ORDER BY created_at DESC';
      const result = await req.query(query);
      return result.recordset;
    }

    return this.memorySnippets.filter(s => s.user_id === userId && (!connectionId || s.connection_id === connectionId));
  }
}

export const metadataStore = new MetadataStore();
