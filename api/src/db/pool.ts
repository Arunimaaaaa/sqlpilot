import sql from 'mssql';
import { config } from '../config/env';

class PoolManager {
  private metadataPool: sql.ConnectionPool | null = null;
  private targetPools: Map<string, sql.ConnectionPool> = new Map();
  private isMetadataConnected: boolean = false;

  async getMetadataPool(): Promise<sql.ConnectionPool | null> {
    if (this.metadataPool && this.metadataPool.connected) {
      return this.metadataPool;
    }

    try {
      const sqlConfig: sql.config = {
        server: config.metadataDb.server,
        port: config.metadataDb.port,
        database: config.metadataDb.database,
        user: config.metadataDb.user,
        password: config.metadataDb.password,
        options: {
          encrypt: config.metadataDb.options.encrypt,
          trustServerCertificate: config.metadataDb.options.trustServerCertificate,
          connectTimeout: config.metadataDb.options.connectTimeout,
          requestTimeout: config.metadataDb.options.requestTimeout
        },
        pool: {
          max: 10,
          min: 0,
          idleTimeoutMillis: 30000
        }
      };

      this.metadataPool = await new sql.ConnectionPool(sqlConfig).connect();
      this.isMetadataConnected = true;
      console.log('Connected to SQLPilot Metadata database via mssql');
      return this.metadataPool;
    } catch (err: any) {
      console.warn(`Could not connect to SQL Server at ${config.metadataDb.server}:${config.metadataDb.port}:`, err.message);
      this.isMetadataConnected = false;
      return null;
    }
  }

  isMetadataDbAvailable(): boolean {
    return this.isMetadataConnected && !!this.metadataPool?.connected;
  }

  async getTargetPool(targetConfig: {
    server: string;
    port: number;
    database: string;
    user: string;
    password?: string;
  }): Promise<sql.ConnectionPool> {
    const key = `${targetConfig.server}:${targetConfig.port}:${targetConfig.database}:${targetConfig.user}`;

    if (this.targetPools.has(key)) {
      const existing = this.targetPools.get(key)!;
      if (existing.connected) return existing;
    }

    const sqlConfig: sql.config = {
      server: targetConfig.server,
      port: targetConfig.port,
      database: targetConfig.database,
      user: targetConfig.user,
      password: targetConfig.password || '',
      options: {
        encrypt: false,
        trustServerCertificate: true,
        connectTimeout: 8000,
        requestTimeout: config.queryGuardrails.maxExecutionTimeMs
      },
      pool: {
        max: 5,
        min: 0,
        idleTimeoutMillis: 30000
      }
    };

    const pool = await new sql.ConnectionPool(sqlConfig).connect();
    this.targetPools.set(key, pool);
    return pool;
  }

  async testConnection(targetConfig: {
    server: string;
    port: number;
    database: string;
    user: string;
    password?: string;
  }): Promise<{ success: boolean; latencyMs: number; error?: string }> {
    const start = Date.now();
    try {
      const pool = await this.getTargetPool(targetConfig);
      const req = pool.request();
      await req.query('SELECT 1 AS ping, @@VERSION AS server_version, CURRENT_USER AS connected_user');
      const latencyMs = Date.now() - start;
      return { success: true, latencyMs };
    } catch (err: any) {
      return {
        success: false,
        latencyMs: Date.now() - start,
        error: err.message || 'Connection failed'
      };
    }
  }

  async closeAll(): Promise<void> {
    if (this.metadataPool) {
      await this.metadataPool.close();
      this.metadataPool = null;
    }
    for (const pool of this.targetPools.values()) {
      if (pool.connected) {
        await pool.close();
      }
    }
    this.targetPools.clear();
  }
}

export const poolManager = new PoolManager();
