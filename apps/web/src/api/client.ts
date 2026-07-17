import type {
  ColumnDefinition,
  ConnectionTestResult,
  DashboardStats,
  DataTypeOption,
  DeployJob,
  PosCredentialsPublic,
  PosMachine,
  SchemaDeployResponse,
  SchemaTable,
  Script,
} from '../types';

const BASE = '/api';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.error ?? `Request failed (${res.status})`);
  }

  return data as T;
}

export const api = {
  getDashboard: () => request<DashboardStats>('/dashboard'),

  getPosCredentials: () => request<PosCredentialsPublic>('/settings/pos-credentials'),
  savePosCredentials: (body: { database_name: string; username?: string; password: string }) =>
    request<PosCredentialsPublic>('/settings/pos-credentials', {
      method: 'PUT',
      body: JSON.stringify(body),
    }),

  getPos: () => request<PosMachine[]>('/pos'),
  canAddPos: () => request<{ ready: boolean }>('/pos/can-add'),
  createPos: (body: { device_name: string }) =>
    request<PosMachine>('/pos', { method: 'POST', body: JSON.stringify(body) }),
  updatePos: (id: number, body: { device_name?: string }) =>
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
};
