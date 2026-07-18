export interface PosMachine {
  id: number;
  name: string;
  host: string;
  database_name: string;
  username: string;
  is_active: number;
  has_password: boolean;
  created_at: string;
}

export interface Script {
  id: number;
  name: string;
  description: string;
  sql_text: string;
  script_type: 'schema' | 'data';
  created_at: string;
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

export interface DeployJob {
  id: string;
  script_id: number;
  script_name?: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  started_at: string;
  finished_at: string | null;
  triggered_by: string;
  pos_count: number;
  results?: DeployResult[];
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

export interface PosCredentialsPublic {
  database_name: string;
  username: string;
  has_password: boolean;
  updated_at: string | null;
  message?: string;
}

export interface ColumnDefinition {
  name: string;
  data_type: string;
  length?: number | null;
  precision?: number | null;
  scale?: number | null;
  nullable?: boolean;
  default_value?: string | null;
  is_primary_key?: boolean;
  is_identity?: boolean;
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

export interface SchemaTable {
  id: number;
  table_name: string;
  description: string;
  created_at: string;
  columns?: SchemaColumn[];
}

export interface DataTypeOption {
  value: string;
  label: string;
  needsLength?: boolean;
  needsPrecision?: boolean;
}

export interface SchemaDeployResponse {
  sql: string;
  jobId: string | null;
  scriptId?: number;
  message?: string;
  table?: SchemaTable;
  column?: SchemaColumn;
}

export interface ParsedInstruction {
  action: string;
  table_name: string;
  description: string;
  columns: string[];
  rows: string[][];
  row_count: number;
}

export interface InstructionParseResult {
  parsed: ParsedInstruction;
  sql: string;
  warnings: string[];
  jobId?: string;
  scriptId?: number;
  message?: string;
}

export interface TableColumnMeta {
  column_name: string;
  data_type: string;
  max_length: number | null;
  precision: number | null;
  scale: number | null;
  is_nullable: boolean;
  is_identity: boolean;
  is_primary_key: boolean;
  column_default: string | null;
  ordinal_position: number;
}

export interface MetadataTablesResponse {
  pos_id: number;
  pos_name: string;
  database: string;
  tables: string[];
}

export interface TableSchemaResponse {
  pos_id: number;
  pos_name: string;
  database: string;
  table_name: string;
  columns: TableColumnMeta[];
}
