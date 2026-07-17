export interface PosMachine {
  id: number;
  name: string;
  host: string;
  database_name: string;
  username: string;
  password: string;
  is_active: number;
  created_at: string;
}

export interface PosMachinePublic extends Omit<PosMachine, 'password'> {
  has_password: boolean;
}

export interface Script {
  id: number;
  name: string;
  description: string;
  sql_text: string;
  script_type: 'schema' | 'data';
  created_at: string;
}

export interface DeployJob {
  id: string;
  script_id: number;
  script_name?: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  started_at: string;
  finished_at: string | null;
  triggered_by: string;
  pos_count: number;
}

export interface DeployResult {
  id: number;
  job_id: string;
  pos_id: number;
  pos_name?: string;
  success: number;
  error_message: string | null;
  duration_ms: number;
}

export interface DashboardStats {
  totalPos: number;
  activePos: number;
  totalScripts: number;
  totalDeploys: number;
  lastDeploy: DeployJob | null;
}

export interface ConnectionTestResult {
  success: boolean;
  message: string;
  latencyMs?: number;
}

export interface CreatePosInput {
  device_name: string;
  is_active?: boolean;
}

export interface CreateScriptInput {
  name: string;
  description?: string;
  sql_text: string;
  script_type?: 'schema' | 'data';
}

export interface DeployRequest {
  script_id: number;
  pos_ids: number[] | 'all';
  triggered_by?: string;
}

export interface DeployJobDetail extends DeployJob {
  results: DeployResult[];
}

export type SqlDataType =
  | 'INT'
  | 'BIGINT'
  | 'SMALLINT'
  | 'TINYINT'
  | 'BIT'
  | 'VARCHAR'
  | 'NVARCHAR'
  | 'CHAR'
  | 'NCHAR'
  | 'DECIMAL'
  | 'NUMERIC'
  | 'FLOAT'
  | 'REAL'
  | 'MONEY'
  | 'DATE'
  | 'DATETIME'
  | 'DATETIME2'
  | 'UNIQUEIDENTIFIER'
  | 'TEXT';

export interface ColumnDefinition {
  name: string;
  data_type: SqlDataType | string;
  length?: number | null;
  precision?: number | null;
  scale?: number | null;
  nullable?: boolean;
  default_value?: string | null;
  is_primary_key?: boolean;
  is_identity?: boolean;
}

export interface CreateTableInput {
  table_name: string;
  description?: string;
  columns: ColumnDefinition[];
  pos_ids: number[] | 'all';
  deploy?: boolean;
}

export interface AddColumnInput {
  table_name: string;
  column: ColumnDefinition;
  pos_ids: number[] | 'all';
  deploy?: boolean;
  schema_table_id?: number;
}

export interface SchemaTable {
  id: number;
  table_name: string;
  description: string;
  created_at: string;
  columns?: SchemaColumn[];
}

export interface SchemaColumn {
  id: number;
  schema_table_id: number | null;
  table_name: string;
  column_name: string;
  data_type: string;
  length: number | null;
  precision: number | null;
  scale: number | null;
  nullable: number;
  default_value: string | null;
  is_primary_key: number;
  is_identity: number;
  created_at: string;
}
