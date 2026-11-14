export interface User {
  id: number;
  email: string;
  password_hash: string;
  created_at: string;
}

export interface UserPublic {
  id: number;
  email: string;
  created_at: string;
}

export interface ConnectionRecord {
  id: number;
  user_id: number;
  name: string;
  server_host: string;
  port: number;
  database_name: string;
  login_username: string;
  secret_ref: string;
  is_read_only: boolean;
  created_at: string;
}

export interface ConnectionCredentials {
  server_host: string;
  port: number;
  database_name: string;
  login_username: string;
  password?: string;
  secret_ref?: string;
  is_read_only?: boolean;
}

export interface ColumnMeta {
  column_name: string;
  data_type: string;
  is_nullable: boolean;
  character_maximum_length: number | null;
  numeric_precision: number | null;
  numeric_scale: number | null;
  is_primary_key: boolean;
  is_foreign_key: boolean;
  column_default: string | null;
  description?: string;
}

export interface ForeignKeyMeta {
  constraint_name: string;
  from_table: string;
  from_column: string;
  to_table: string;
  to_column: string;
}

export interface IndexMeta {
  index_name: string;
  table_name: string;
  is_unique: boolean;
  is_primary_key: boolean;
  columns: string[];
}

export interface TableMeta {
  table_schema: string;
  table_name: string;
  table_type: 'BASE TABLE' | 'VIEW';
  columns: ColumnMeta[];
  primary_key: string[];
  foreign_keys: ForeignKeyMeta[];
  indexes: IndexMeta[];
  row_count_estimate?: number;
}

export interface IntrospectedSchema {
  connection_id: number;
  database_name: string;
  refreshed_at: string;
  tables: TableMeta[];
  foreign_keys: ForeignKeyMeta[];
}

export interface QueryValidationResult {
  is_valid: boolean;
  error?: string;
  sanitized_sql?: string;
  statement_type?: string;
  warnings?: string[];
}

export interface QueryExecutionResult {
  columns: Array<{ name: string; type: string }>;
  rows: Record<string, any>[];
  row_count: number;
  duration_ms: number;
  truncated: boolean;
}

export interface QueryHistoryRecord {
  id: number;
  user_id: number;
  connection_id: number;
  nl_prompt: string | null;
  generated_sql: string;
  status: 'SUCCESS' | 'ERROR' | 'REJECTED';
  row_count: number | null;
  duration_ms: number | null;
  error: string | null;
  created_at: string;
}

export interface SavedSnippet {
  id: number;
  user_id: number;
  connection_id: number;
  title: string;
  sql_text: string;
  notes: string | null;
  created_at: string;
}

export interface MissingIndexRecommendation {
  id?: number;
  connection_id: number;
  table_name: string;
  suggested_index: string;
  equality_columns: string[];
  inequality_columns: string[];
  included_columns: string[];
  impact_estimate: number;
  avg_user_impact: number;
  user_seeks: number;
  rationale?: string;
  source: 'DMV_MISSING_INDEX';
  created_at?: string;
}

export interface SlowQueryDiagnostic {
  query_id?: string;
  sql_text: string;
  execution_count: number;
  total_worker_time_ms: number;
  avg_worker_time_ms: number;
  total_elapsed_time_ms: number;
  avg_elapsed_time_ms: number;
  total_logical_reads: number;
  avg_logical_reads: number;
  last_execution_time: string;
  rationale?: string;
}

export interface PerformanceAnalysisReport {
  connection_id: number;
  analyzed_at: string;
  missing_indexes: MissingIndexRecommendation[];
  slow_queries: SlowQueryDiagnostic[];
}
