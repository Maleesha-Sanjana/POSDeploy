import type {
  ColumnDefinition,
  ConnectionTestResult,
  DashboardStats,
  DataTypeOption,
  DeployJob,

  PosMachine,
  SchemaDeployResponse,
  SchemaTable,
  Script,
  InstructionParseResult,
  MetadataTablesResponse,
  TableSchemaResponse,
} from '../types';

export const DEFAULT_DATABASE = 'POS_SOLUTION';

const BASE = '/api';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const hasBody = options?.body !== undefined && options?.body !== null && options?.body !== '';
  const headers: Record<string, string> = {};

  if (hasBody) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${BASE}${url}`, {
    ...options,
    headers: { ...headers, ...(options?.headers as Record<string, string> | undefined) },
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const message =
      typeof data.error === 'string'
        ? data.error
        : typeof data.message === 'string'
          ? data.message
          : `Request failed (${res.status})`;
    throw new Error(message);
  }

  return data as T;
}

export const api = {
  getDashboard: () => request<DashboardStats>('/dashboard'),

  getPos: () => request<PosMachine[]>('/pos'),
  discoverPos: () => request<{ name: string; ip: string; mac: string }[]>('/pos/discover'),
  createPos: (body: { device_name: string; password?: string }) =>
    request<PosMachine>('/pos', { method: 'POST', body: JSON.stringify(body) }),
  updatePos: (id: number, body: { device_name?: string; password?: string }) =>
    request<PosMachine>(`/pos/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deletePos: (id: number) => request<{ success: boolean }>(`/pos/${id}`, { method: 'DELETE' }),
  testPos: (id: number) => request<ConnectionTestResult>(`/pos/${id}/test`, { method: 'POST' }),

  getScripts: () => request<Script[]>('/scripts'),
  createScript: (body: {
    name: string;
    description?: string;
    sql_text: string;
    script_type?: 'schema' | 'data';
  }) => request<Script>('/scripts', { method: 'POST', body: JSON.stringify(body) }),
  updateScript: (id: number, body: Partial<{
    name: string;
    description: string;
    sql_text: string;
    script_type: 'schema' | 'data';
  }>) => request<Script>(`/scripts/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteScript: (id: number) => request<{ success: boolean }>(`/scripts/${id}`, { method: 'DELETE' }),

  getDeployHistory: () => request<DeployJob[]>('/deploy'),
  getDeployJob: (jobId: string) => request<DeployJob>(`/deploy/${jobId}`),
  startDeploy: (body: { script_id: number; pos_ids: number[] | 'all'; triggered_by?: string }) =>
    request<{ jobId: string; message: string }>('/deploy', { method: 'POST', body: JSON.stringify(body) }),

  getSchemaTables: () => request<SchemaTable[]>('/schema/tables'),
  getDataTypes: () => request<DataTypeOption[]>('/schema/datatypes'),
  createSchemaTable: (body: {
    table_name: string;
    description?: string;
    columns: ColumnDefinition[];
    pos_ids: number[] | 'all';
    deploy?: boolean;
  }) => request<SchemaDeployResponse>('/schema/tables', { method: 'POST', body: JSON.stringify(body) }),
  addSchemaColumn: (body: {
    table_name: string;
    column: ColumnDefinition;
    pos_ids: number[] | 'all';
    deploy?: boolean;
    schema_table_id?: number;
  }) => request<SchemaDeployResponse>('/schema/columns', { method: 'POST', body: JSON.stringify(body) }),
  deleteSchemaTable: (id: number) =>
    request<{ success: boolean }>(`/schema/tables/${id}`, { method: 'DELETE' }),

  parseInstructions: (body: { text: string; table_name: string; database?: string; pos_id?: number }) =>
    request<InstructionParseResult>('/instructions/parse', { method: 'POST', body: JSON.stringify(body) }),
  deployInstructions: (body: {
    text: string;
    table_name: string;
    database?: string;
    pos_id?: number;
    pos_ids: number[] | 'all';
  }) => request<InstructionParseResult>('/instructions/deploy', { method: 'POST', body: JSON.stringify(body) }),

  getTablesFromPos: (database: string, posId?: number) =>
    request<MetadataTablesResponse>(
      `/metadata/tables?database=${encodeURIComponent(database)}${posId ? `&pos_id=${posId}` : ''}`
    ),
  getTableSchemaFromPos: (database: string, table: string, posId?: number) =>
    request<TableSchemaResponse>(
      `/metadata/table-schema?database=${encodeURIComponent(database)}&table=${encodeURIComponent(table)}${posId ? `&pos_id=${posId}` : ''}`
    ),

  uploadDebug: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return fetch('/api/debug/upload', {
      method: 'POST',
      body: formData,
    }).then(async (r) => {
      if (!r.ok) {
        const text = await r.text();
        throw new Error(text);
      }
      return r.json() as Promise<{ success: boolean; filename: string }>;
    });
  },
  deployDebug: (body: { filename: string; pos_ids: number[] | 'all' }) =>
    request<{ results: { pos_id: number; pos_name: string; success: boolean; error?: string }[] }>('/debug/deploy', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
};
