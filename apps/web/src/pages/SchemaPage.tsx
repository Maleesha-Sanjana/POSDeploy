import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import type {
  ColumnDefinition,
  DataTypeOption,
  DeployJob,
  PosMachine,
  SchemaTable,
} from '../types';
import {
  Alert,
  Badge,
  Button,
  Card,
  Input,
  PageHeader,
  Select,
} from '../components/ui';

type Mode = 'create-table' | 'add-column';

const emptyColumn = (): ColumnDefinition => ({
  name: '',
  data_type: 'NVARCHAR',
  length: 50,
  precision: 18,
  scale: 2,
  nullable: true,
  default_value: '',
  is_primary_key: false,
  is_identity: false,
});

function needsLength(type: string) {
  return ['VARCHAR', 'NVARCHAR', 'CHAR', 'NCHAR'].includes(type);
}

function needsPrecision(type: string) {
  return ['DECIMAL', 'NUMERIC'].includes(type);
}

export function SchemaPage() {
  const [mode, setMode] = useState<Mode>('create-table');
  const [tables, setTables] = useState<SchemaTable[]>([]);
  const [posList, setPosList] = useState<PosMachine[]>([]);
  const [dataTypes, setDataTypes] = useState<DataTypeOption[]>([]);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Create table form
  const [tableName, setTableName] = useState('');
  const [description, setDescription] = useState('');
  const [columns, setColumns] = useState<ColumnDefinition[]>([emptyColumn()]);

  // Add column form
  const [targetTable, setTargetTable] = useState('');
  const [customTableName, setCustomTableName] = useState('');
  const [addColumn, setAddColumn] = useState<ColumnDefinition>(emptyColumn());

  // POS targets
  const [deployAll, setDeployAll] = useState(true);
  const [selectedPos, setSelectedPos] = useState<number[]>([]);

  // Deploy progress
  const [job, setJob] = useState<DeployJob | null>(null);
  const [generatedSql, setGeneratedSql] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = () => {
    Promise.all([api.getSchemaTables(), api.getPos(), api.getDataTypes()])
      .then(([t, p, d]) => {
        setTables(t);
        setPosList(p.filter((x) => x.is_active));
        setDataTypes(d);
      })
      .catch((e) => setError(e.message));
  };

  useEffect(() => {
    load();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const activePos = posList.filter((p) => p.is_active);

  const togglePos = (id: number) => {
    setSelectedPos((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const pollJob = (jobId: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const updated = await api.getDeployJob(jobId);
        setJob(updated);
        if (updated.status === 'completed' || updated.status === 'failed') {
          if (pollRef.current) clearInterval(pollRef.current);
          setSubmitting(false);
          load();
        }
      } catch {
        if (pollRef.current) clearInterval(pollRef.current);
        setSubmitting(false);
      }
    }, 1500);
  };

  const updateColumn = (index: number, patch: Partial<ColumnDefinition>) => {
    setColumns((prev) => prev.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  };

  const handleCreateTable = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfo('');
    setJob(null);

    if (!tableName.trim()) {
      setError('Table name is required');
      return;
    }
    if (columns.some((c) => !c.name.trim())) {
      setError('Every column needs a name');
      return;
    }
    if (!deployAll && selectedPos.length === 0) {
      setError('Select at least one POS machine, or choose All');
      return;
    }
    if (activePos.length === 0) {
      setError('Add POS machines first (POS Machines page)');
      return;
    }

    setSubmitting(true);
    try {
      const result = await api.createSchemaTable({
        table_name: tableName.trim(),
        description: description.trim(),
        columns: columns.map((c) => ({
          ...c,
          name: c.name.trim(),
          default_value: c.default_value?.trim() || null,
        })),
        pos_ids: deployAll ? 'all' : selectedPos,
        deploy: true,
      });

      setGeneratedSql(result.sql);
      setInfo(result.message ?? 'Deploy started');
      setTableName('');
      setDescription('');
      setColumns([emptyColumn()]);

      if (result.jobId) {
        const initial = await api.getDeployJob(result.jobId);
        setJob(initial);
        pollJob(result.jobId);
      } else {
        setSubmitting(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create table failed');
      setSubmitting(false);
    }
  };

  const handleAddColumn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfo('');
    setJob(null);

    const resolvedTable = targetTable === '__custom__' ? customTableName.trim() : targetTable.trim();
    if (!resolvedTable) {
      setError('Table name is required');
      return;
    }
    if (!addColumn.name.trim()) {
      setError('Column name is required');
      return;
    }
    if (!deployAll && selectedPos.length === 0) {
      setError('Select at least one POS machine, or choose All');
      return;
    }
    if (activePos.length === 0) {
      setError('Add POS machines first (POS Machines page)');
      return;
    }

    const matched = tables.find((t) => t.table_name === resolvedTable);

    setSubmitting(true);
    try {
      const result = await api.addSchemaColumn({
        table_name: resolvedTable,
        column: {
          ...addColumn,
          name: addColumn.name.trim(),
          default_value: addColumn.default_value?.trim() || null,
        },
        pos_ids: deployAll ? 'all' : selectedPos,
        deploy: true,
        schema_table_id: matched?.id,
      });

      setGeneratedSql(result.sql);
      setInfo(result.message ?? 'Deploy started');
      setAddColumn(emptyColumn());
      setCustomTableName('');
      if (targetTable === '__custom__') setTargetTable('');

      if (result.jobId) {
        const initial = await api.getDeployJob(result.jobId);
        setJob(initial);
        pollJob(result.jobId);
      } else {
        setSubmitting(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Add column failed');
      setSubmitting(false);
    }
  };

  const successCount = job?.results?.filter((r) => r.success).length ?? 0;
  const failCount = job?.results?.filter((r) => !r.success).length ?? 0;

  return (
    <div>
      <PageHeader
        title="Schema Builder"
        description="Create custom tables or add columns, then push changes to POS databases"
      />

      {activePos.length === 0 && (
        <div className="mb-4">
          <Alert
            type="info"
            message="No POS machines configured. Go to POS Machines and add each device name (POS1, POS2, …) first."
          />
          <Link to="/pos" className="inline-block mt-2 text-sm text-brand-600 hover:underline">
            Open POS Machines →
          </Link>
        </div>
      )}

      {error && <div className="mb-4"><Alert type="error" message={error} /></div>}
      {info && <div className="mb-4"><Alert type="success" message={info} /></div>}

      <div className="flex gap-2 mb-6">
        <Button
          variant={mode === 'create-table' ? 'primary' : 'secondary'}
          onClick={() => setMode('create-table')}
        >
          Create Table
        </Button>
        <Button
          variant={mode === 'add-column' ? 'primary' : 'secondary'}
          onClick={() => setMode('add-column')}
        >
          Add Column
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {mode === 'create-table' ? (
            <Card className="p-6">
              <form onSubmit={handleCreateTable} className="space-y-5">
                <Input
                  label="Table Name"
                  value={tableName}
                  onChange={(e) => setTableName(e.target.value)}
                  placeholder="e.g. custom_promo"
                  required
                  disabled={submitting}
                />
                <Input
                  label="Description (optional)"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What this table is for"
                  disabled={submitting}
                />

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-slate-700">Columns</span>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => setColumns((prev) => [...prev, emptyColumn()])}
                      disabled={submitting}
                    >
                      + Column
                    </Button>
                  </div>

                  <div className="space-y-4">
                    {columns.map((col, index) => (
                      <ColumnEditor
                        key={index}
                        col={col}
                        dataTypes={dataTypes}
                        disabled={submitting}
                        onChange={(patch) => updateColumn(index, patch)}
                        onRemove={
                          columns.length > 1
                            ? () => setColumns((prev) => prev.filter((_, i) => i !== index))
                            : undefined
                        }
                      />
                    ))}
                  </div>
                </div>

                <PosTargetPicker
                  activePos={activePos}
                  deployAll={deployAll}
                  selectedPos={selectedPos}
                  disabled={submitting}
                  onDeployAllChange={setDeployAll}
                  onTogglePos={togglePos}
                />

                <Button type="submit" disabled={submitting || activePos.length === 0} className="w-full">
                  {submitting ? 'Deploying to POS...' : 'Create Table & Deploy to POS'}
                </Button>
              </form>
            </Card>
          ) : (
            <Card className="p-6">
              <form onSubmit={handleAddColumn} className="space-y-5">
                <Select
                  label="Target Table"
                  value={targetTable}
                  onChange={(e) => setTargetTable(e.target.value)}
                  disabled={submitting}
                  required
                >
                  <option value="">— Select table —</option>
                  {tables.map((t) => (
                    <option key={t.id} value={t.table_name}>{t.table_name}</option>
                  ))}
                  <option value="__custom__">Existing table (type name)…</option>
                </Select>

                {targetTable === '__custom__' && (
                  <Input
                    label="Existing Table Name"
                    value={customTableName}
                    onChange={(e) => setCustomTableName(e.target.value)}
                    placeholder="e.g. gen_usergroup"
                    required
                    disabled={submitting}
                  />
                )}

                <ColumnEditor
                  col={addColumn}
                  dataTypes={dataTypes}
                  disabled={submitting}
                  onChange={(patch) => setAddColumn((prev) => ({ ...prev, ...patch }))}
                />

                <PosTargetPicker
                  activePos={activePos}
                  deployAll={deployAll}
                  selectedPos={selectedPos}
                  disabled={submitting}
                  onDeployAllChange={setDeployAll}
                  onTogglePos={togglePos}
                />

                <Button type="submit" disabled={submitting || activePos.length === 0} className="w-full">
                  {submitting ? 'Deploying to POS...' : 'Add Column & Deploy to POS'}
                </Button>
              </form>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card className="p-5">
            <h3 className="font-semibold text-slate-900 mb-3">Deploy Progress</h3>
            {!job ? (
              <p className="text-sm text-slate-500">Submit a table or column to push SQL to POS machines.</p>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Badge status={job.status} />
                  <span className="text-sm text-slate-600">{job.script_name}</span>
                </div>
                {job.status === 'running' && (
                  <div className="flex items-center gap-2 text-sm text-blue-600">
                    <span className="inline-block w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                    Running on POS…
                  </div>
                )}
                {(job.status === 'completed' || job.status === 'failed') && (
                  <Alert
                    type={job.status === 'completed' ? 'success' : 'error'}
                    message={`${successCount} succeeded, ${failCount} failed`}
                  />
                )}
                {job.results && job.results.length > 0 && (
                  <ul className="text-sm space-y-2">
                    {job.results.map((r) => (
                      <li key={r.id} className="flex flex-col gap-0.5 border-b border-slate-100 pb-2">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{r.pos_name}</span>
                          <Badge status={r.success ? 'completed' : 'failed'} />
                        </div>
                        {r.error_message && (
                          <span className="text-xs text-red-600">{r.error_message}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </Card>

          {generatedSql && (
            <Card className="p-5">
              <h3 className="font-semibold text-slate-900 mb-3">Generated SQL</h3>
              <pre className="bg-slate-900 text-green-300 rounded-lg p-3 text-xs overflow-x-auto whitespace-pre-wrap max-h-64">
                {generatedSql}
              </pre>
            </Card>
          )}

          <Card className="p-5">
            <h3 className="font-semibold text-slate-900 mb-3">Tracked Tables</h3>
            {tables.length === 0 ? (
              <p className="text-sm text-slate-500">No custom tables yet.</p>
            ) : (
              <ul className="space-y-3 text-sm">
                {tables.map((t) => (
                  <li key={t.id} className="border-b border-slate-100 pb-2">
                    <div className="font-medium">{t.table_name}</div>
                    <div className="text-slate-500 text-xs mt-0.5">
                      {(t.columns ?? []).map((c) => c.column_name).join(', ') || 'No columns'}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function PosTargetPicker({
  activePos,
  deployAll,
  selectedPos,
  disabled,
  onDeployAllChange,
  onTogglePos,
}: {
  activePos: PosMachine[];
  deployAll: boolean;
  selectedPos: number[];
  disabled?: boolean;
  onDeployAllChange: (v: boolean) => void;
  onTogglePos: (id: number) => void;
}) {
  return (
    <div>
      <label className="text-sm font-medium text-slate-700 mb-2 block">
        Target POS machines
      </label>
      <label className="flex items-center gap-2 mb-2">
        <input
          type="radio"
          checked={deployAll}
          onChange={() => onDeployAllChange(true)}
          disabled={disabled}
        />
        <span className="text-sm">All active POS ({activePos.length})</span>
      </label>
      <label className="flex items-center gap-2 mb-2">
        <input
          type="radio"
          checked={!deployAll}
          onChange={() => onDeployAllChange(false)}
          disabled={disabled}
        />
        <span className="text-sm">Selected POS only</span>
      </label>
      {!deployAll && (
        <div className="border border-slate-200 rounded-lg p-3 space-y-2 max-h-40 overflow-y-auto">
          {activePos.map((pos) => (
            <label key={pos.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={selectedPos.includes(pos.id)}
                onChange={() => onTogglePos(pos.id)}
                disabled={disabled}
              />
              {pos.name}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function ColumnEditor({
  col,
  dataTypes,
  disabled,
  onChange,
  onRemove,
}: {
  col: ColumnDefinition;
  dataTypes: DataTypeOption[];
  disabled?: boolean;
  onChange: (patch: Partial<ColumnDefinition>) => void;
  onRemove?: () => void;
}) {
  return (
    <div className="border border-slate-200 rounded-lg p-4 space-y-3 bg-slate-50/50">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input
          label="Column Name"
          value={col.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="e.g. LevelName"
          required
          disabled={disabled}
        />
        <Select
          label="Data Type"
          value={col.data_type}
          onChange={(e) => onChange({ data_type: e.target.value })}
          disabled={disabled}
        >
          {(dataTypes.length ? dataTypes : [
            { value: 'NVARCHAR', label: 'NVARCHAR' },
            { value: 'INT', label: 'INT' },
            { value: 'BIT', label: 'BIT' },
            { value: 'DECIMAL', label: 'DECIMAL' },
            { value: 'DATETIME', label: 'DATETIME' },
          ]).map((dt) => (
            <option key={dt.value} value={dt.value}>{dt.label}</option>
          ))}
        </Select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {needsLength(col.data_type) && (
          <Input
            label="Length"
            type="number"
            value={col.length ?? 50}
            onChange={(e) => onChange({ length: Number(e.target.value) })}
            disabled={disabled}
          />
        )}
        {needsPrecision(col.data_type) && (
          <>
            <Input
              label="Precision"
              type="number"
              value={col.precision ?? 18}
              onChange={(e) => onChange({ precision: Number(e.target.value) })}
              disabled={disabled}
            />
            <Input
              label="Scale"
              type="number"
              value={col.scale ?? 2}
              onChange={(e) => onChange({ scale: Number(e.target.value) })}
              disabled={disabled}
            />
          </>
        )}
        <Input
          label="Default (optional)"
          value={col.default_value ?? ''}
          onChange={(e) => onChange({ default_value: e.target.value })}
          placeholder="0 / GETDATE() / 'text'"
          disabled={disabled}
        />
      </div>

      <div className="flex flex-wrap items-center gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={col.nullable !== false}
            onChange={(e) => onChange({ nullable: e.target.checked })}
            disabled={disabled || col.is_primary_key}
          />
          Nullable
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={!!col.is_primary_key}
            onChange={(e) => onChange({
              is_primary_key: e.target.checked,
              nullable: e.target.checked ? false : col.nullable,
            })}
            disabled={disabled}
          />
          Primary Key
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={!!col.is_identity}
            onChange={(e) => onChange({ is_identity: e.target.checked })}
            disabled={disabled}
          />
          Identity
        </label>
        {onRemove && (
          <Button type="button" size="sm" variant="danger" onClick={onRemove} disabled={disabled} className="ml-auto">
            Remove
          </Button>
        )}
      </div>
    </div>
  );
}
