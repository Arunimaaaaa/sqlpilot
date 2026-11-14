import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '4000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET || 'sqlpilot-dev-jwt-super-secret-key-32chars',
  jwtExpiresIn: '7d',

  metadataDb: {
    server: process.env.METADATA_DB_SERVER || 'localhost',
    port: parseInt(process.env.METADATA_DB_PORT || '1433', 10),
    database: process.env.METADATA_DB_NAME || 'SQLPilotMeta',
    user: process.env.METADATA_DB_USER || 'sa',
    password: process.env.METADATA_DB_PASSWORD || 'SqlPilotStrongP@ss2026!',
    options: {
      encrypt: process.env.METADATA_DB_ENCRYPT === 'true',
      trustServerCertificate: process.env.METADATA_DB_TRUST_SERVER_CERT !== 'false',
      connectTimeout: 5000,
      requestTimeout: 15000
    }
  },

  useInMemoryFallback: process.env.USE_IN_MEMORY_FALLBACK_IF_SQLSERVER_UNREACHABLE !== 'false',

  secrets: {
    storageType: (process.env.SECRETS_STORAGE_TYPE || 'local_vault') as 'local_vault' | 'aws_secrets_manager',
    encryptionKey: process.env.LOCAL_VAULT_ENCRYPTION_KEY || 'sqlpilot-32-byte-encryption-key-for-local-vault!!',
    awsRegion: process.env.AWS_REGION || 'us-east-1'
  },

  llm: {
    provider: (process.env.LLM_PROVIDER || 'gemini') as 'gemini' | 'openai' | 'bedrock' | 'mock',
    geminiApiKey: process.env.GEMINI_API_KEY || '',
    openaiApiKey: process.env.OPENAI_API_KEY || '',
    bedrockRegion: process.env.BEDROCK_REGION || 'us-east-1',
    model: process.env.LLM_MODEL || 'gemini-2.5-flash'
  },

  queryGuardrails: {
    maxExecutionTimeMs: 15000, // 15 second default timeout
    defaultRowCap: 500,
    maxRowCap: 2000
  }
};
