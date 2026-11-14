import { metadataStore } from '../db/metadata.store';
import { poolManager } from '../db/pool';
import { secretsService } from './secrets.service';
import { ConnectionRecord, ConnectionCredentials } from '../types';

export class ConnectionService {
  async listConnections(userId: number): Promise<ConnectionRecord[]> {
    return metadataStore.listConnections(userId);
  }

  async getConnection(userId: number, id: number): Promise<ConnectionRecord | null> {
    return metadataStore.getConnectionById(userId, id);
  }

  async createConnection(
    userId: number,
    data: {
      name: string;
      server_host: string;
      port?: number;
      database_name: string;
      login_username: string;
      password: string;
      is_read_only?: boolean;
    }
  ): Promise<ConnectionRecord> {
    const port = data.port || 1433;
    const isReadOnly = data.is_read_only !== undefined ? data.is_read_only : true;

    // 1. Store credentials securely in Secrets Manager (or local encrypted vault)
    // NEVER write plaintext passwords to the database!
    const secretRef = await secretsService.storeSecret(`conn-${data.database_name}`, {
      password: data.password,
      metadata: {
        server_host: data.server_host,
        port,
        database_name: data.database_name,
        login_username: data.login_username
      }
    });

    // 2. Persist connection with only the secret reference
    const record = await metadataStore.createConnection(userId, {
      name: data.name,
      server_host: data.server_host,
      port,
      database_name: data.database_name,
      login_username: data.login_username,
      secret_ref: secretRef,
      is_read_only: isReadOnly
    });

    return record;
  }

  async testConnectionCredentials(creds: {
    server_host: string;
    port?: number;
    database_name: string;
    login_username: string;
    password?: string;
  }): Promise<{ success: boolean; latencyMs: number; error?: string }> {
    return poolManager.testConnection({
      server: creds.server_host,
      port: creds.port || 1433,
      database: creds.database_name,
      user: creds.login_username,
      password: creds.password
    });
  }

  async getResolvedCredentials(userId: number, connectionId: number): Promise<ConnectionCredentials> {
    const conn = await metadataStore.getConnectionById(userId, connectionId);
    if (!conn) {
      throw new Error(`Connection not found: ${connectionId}`);
    }

    let password = '';
    try {
      const secret = await secretsService.getSecret(conn.secret_ref);
      password = secret.password || '';
    } catch (err: any) {
      // In local dev if secret wasn't explicitly saved, try default read-only pass
      if (conn.login_username === 'sqlpilot_readonly') {
        password = 'ReadOnlyPass2026!';
      }
    }

    return {
      server_host: conn.server_host,
      port: conn.port,
      database_name: conn.database_name,
      login_username: conn.login_username,
      password,
      secret_ref: conn.secret_ref,
      is_read_only: conn.is_read_only
    };
  }

  async deleteConnection(userId: number, id: number): Promise<boolean> {
    const conn = await metadataStore.getConnectionById(userId, id);
    if (!conn) return false;

    // Delete secret reference
    await secretsService.deleteSecret(conn.secret_ref);
    return metadataStore.deleteConnection(userId, id);
  }
}

export const connectionService = new ConnectionService();
