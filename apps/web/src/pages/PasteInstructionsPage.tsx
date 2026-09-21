import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, DEFAULT_DATABASE } from '../api/client';
import type { DeployJob, InstructionParseResult, PosMachine, TableColumnMeta } from '../types';
import {
  Alert,
  Badge,
  Button,
  Card,
  PageHeader,
  Select,
  Textarea,
} from '../components/ui';

const EXAMPLE_ROWS = `33	P         	1	Level 1	015	0.00	0.00	True	179
33	P         	2	Level 2	015	0.00	0.00	True	180
33	P         	3	Level 3	015	0.00	0.00	True	181`;

export function PasteInstructionsPage() {
  const [text, setText] = useState('');
  const [parseResult, setParseResult] = useState<InstructionParseResult | null>(null);
  const [allPos, setAllPos] = useState<PosMachine[]>([]);
  const [deployAll, setDeployAll] = useState(true);
  const [selectedPos, setSelectedPos] = useState<number[]>([]);

  const [sourcePosId, setSourcePosId] = useState('');
  const [tables, setTables] = useState<string[]>([]);
  const [selectedTable, setSelectedTable] = useState('');
  const [tableSchema, setTableSchema] = useState<TableColumnMeta[] | null>(null);
  const [loadingTables, setLoadingTables] = useState(false);
  const [loadingSchema, setLoadingSchema] = useState(false);
  const [tablesHint, setTablesHint] = useState('');

  const [error, setError] = useState('');
  const [parsing, setParsing] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [job, setJob] = useState<DeployJob | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const activePos = allPos.filter((p) => p.is_active);

  useEffect(() => {
    api.getPos()
      .then((pos) => {
        setAllPos(pos);
        if (pos.length > 0) {
          setSourcePosId(String(pos[0].id));
        }
      })
      .catch((e) => setError(e.message));

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // Load tables from POS (database always POS_SOLUTION)
  useEffect(() => {
    if (!sourcePosId) {
      setTables([]);
      setSelectedTable('');
      setTablesHint('Add a POS machine first');
      return;
    }

    setLoadingTables(true);
    setTablesHint('');
    setError('');

    api.getTablesFromPos(DEFAULT_DATABASE, Number(sourcePosId))
      .then((res) => {
        setTables(res.tables);
        if (res.tables.length === 0) {
          setTablesHint('No tables found in this database');
          setSelectedTable('');
          return;
        }
        const preferred = res.tables.find((t) => t === 'gen_usergroup');
        setSelectedTable(preferred ?? res.tables[0]);
      })
      .catch((e) => {
        setTables([]);
        setSelectedTable('');
        setTablesHint(e instanceof Error ? e.message : 'Failed to load tables');
      })
      .finally(() => setLoadingTables(false));
  }, [sourcePosId]);

  // Load table schema when table selected
  useEffect(() => {
    if (!selectedTable || !sourcePosId) {
      setTableSchema(null);
      return;
    }

    setLoadingSchema(true);
    api.getTableSchemaFromPos(DEFAULT_DATABASE, selectedTable, Number(sourcePosId))
      .then((res) => setTableSchema(res.columns))
      .catch((e) => {
        setTableSchema(null);
        setError(e instanceof Error ? e.message : 'Failed to load table schema');
      })
      .finally(() => setLoadingSchema(false));
  }, [selectedTable, sourcePosId]);

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
          setDeploying(false);
        }
      } catch {
        if (pollRef.current) clearInterval(pollRef.current);
        setDeploying(false);
      }
    }, 1500);
  };

  const buildOptions = () => ({
    text,
    table_name: selectedTable,
    database: DEFAULT_DATABASE,
    pos_id: sourcePosId ? Number(sourcePosId) : undefined,
  });

  const handleParse = async () => {
    if (!selectedTable) {
      setError('Select a table first');
      return;
    }

    setError('');
    setParsing(true);
    setParseResult(null);
    setJob(null);

    try {
      const result = await api.parseInstructions(buildOptions());
      setParseResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Parse failed');
    } finally {
      setParsing(false);
    }
  };

  const handleDeploy = async () => {

    if (!selectedTable) {
      setError('Select a table first');
      return;
    }

    if (!deployAll && selectedPos.length === 0) {
      setError('Select at least one POS machine');
      return;
    }

    setError('');
    setDeploying(true);
    setJob(null);

    try {
      const result = await api.deployInstructions({
        ...buildOptions(),
        pos_ids: deployAll ? 'all' : selectedPos,
      });

      setParseResult(result);

      if (result.jobId) {
        const initial = await api.getDeployJob(result.jobId);
        setJob(initial);
        pollJob(result.jobId);
      } else {
        setDeploying(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Deploy failed');
      setDeploying(false);
    }
  };

  const successCount = job?.results?.filter((r) => r.success).length ?? 0;
  const failCount = job?.results?.filter((r) => !r.success).length ?? 0;
  const insertableCols = tableSchema?.filter((c) => !c.is_identity) ?? [];
  const canSubmit = Boolean(text.trim() && selectedTable);

  return (
    <div>
      <PageHeader
        title="Paste Instructions"
        description="Select the table, paste data rows, and deploy to all POS machines"
      />

      {allPos.length === 0 && (
        <div className="mb-4">
          <Alert type="info" message="No POS machines yet. Add one in POS Discovering to load table names." />
          <Link to="/pos" className="inline-block mt-2 text-sm text-brand-600 hover:underline">
            POS Discovering →
          </Link>
        </div>
      )}

      {error && <div className="mb-4"><Alert type="error" message={error} /></div>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          <Card className="p-6 space-y-4">
            <h3 className="font-semibold text-slate-900">Select Table</h3>
            <p className="text-xs text-slate-500">
              Database: <strong className="font-mono">{DEFAULT_DATABASE}</strong> (same on all POS)
            </p>

            <Select
              label="Read tables from POS"
              value={sourcePosId}
              onChange={(e) => setSourcePosId(e.target.value)}
            >
              <option value="">— Select POS —</option>
              {allPos.map((pos) => (
                <option key={pos.id} value={String(pos.id)}>
                  {pos.name}{pos.is_active ? '' : ' (offline)'}
                </option>
              ))}
            </Select>

            <Select
              label="Table"
              value={selectedTable}
              onChange={(e) => setSelectedTable(e.target.value)}
              disabled={loadingTables}
            >
              <option value="">
                {loadingTables ? 'Loading tables...' : '— Select table —'}
              </option>
              {tables.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </Select>

            {tablesHint && !loadingTables && (
              <p className="text-xs text-amber-600">{tablesHint}</p>
            )}

            {selectedTable && (
              <div className="text-sm text-slate-600">
                {loadingSchema ? (
                  'Loading table structure...'
                ) : tableSchema ? (
                  <span className="text-green-600">
                    ✓ {insertableCols.length} columns loaded from {selectedTable}
                  </span>
                ) : null}
              </div>
            )}
          </Card>

          <Card className="p-6 space-y-4">
            <Textarea
              label="Paste data rows"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={10}
              placeholder={EXAMPLE_ROWS}
            />
            <p className="text-xs text-slate-500">
              Paste only the data rows (tab-separated). Select the table above before deploying.
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setText(EXAMPLE_ROWS)}
            >
              Load example rows
            </Button>

            <div className="flex gap-2">
              <Button onClick={handleParse} disabled={parsing || !canSubmit} variant="secondary">
                {parsing ? 'Extracting...' : 'Extract & Preview'}
              </Button>
              <Button onClick={handleDeploy} disabled={deploying || !canSubmit}>
                {deploying ? 'Deploying...' : 'Deploy to All POS'}
              </Button>
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="font-semibold text-slate-900 mb-3">Target POS</h3>
            <label className="flex items-center gap-2 mb-2 text-sm cursor-pointer">
              <input type="radio" checked={deployAll} onChange={() => setDeployAll(true)} />
              All active POS ({activePos.length})
            </label>
            <label className="flex items-center gap-2 mb-2 text-sm cursor-pointer">
              <input type="radio" checked={!deployAll} onChange={() => setDeployAll(false)} />
              Selected POS only
            </label>
            {!deployAll && (
              <div className="border border-slate-200 rounded-lg p-3 space-y-2 max-h-32 overflow-y-auto">
                {activePos.length === 0 ? (
                  <p className="text-xs text-slate-500">No active POS machines. Test connection on POS Discovering page.</p>
                ) : (
                  activePos.map((pos) => (
                    <label key={pos.id} className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedPos.includes(pos.id)}
                        onChange={() => togglePos(pos.id)}
                      />
                      {pos.name}
                    </label>
                  ))
                )}
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          {tableSchema && selectedTable && (
            <Card className="p-6">
              <h3 className="font-semibold text-slate-900 mb-3">
                {selectedTable} — structure from POS
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50">
                      <th className="text-left px-2 py-1.5">Column</th>
                      <th className="text-left px-2 py-1.5">Type</th>
                      <th className="text-left px-2 py-1.5">Nullable</th>
                      <th className="text-left px-2 py-1.5">Flags</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tableSchema.map((col) => (
                      <tr key={col.column_name} className={`border-b border-slate-100 ${col.is_identity ? 'opacity-50' : ''}`}>
                        <td className="px-2 py-1.5 font-mono font-medium">{col.column_name}</td>
                        <td className="px-2 py-1.5 text-slate-600">{col.data_type}</td>
                        <td className="px-2 py-1.5">{col.is_nullable ? 'YES' : 'NO'}</td>
                        <td className="px-2 py-1.5 space-x-1">
                          {col.is_primary_key && (
                            <span className="text-xs bg-purple-100 text-purple-800 px-1.5 py-0.5 rounded">PK</span>
                          )}
                          {col.is_identity && <span className="text-slate-400">identity</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {parseResult ? (
            <>
              <Card className="p-6">
                <h3 className="font-semibold text-slate-900 mb-4">Extracted</h3>
                <div className="space-y-2 text-sm">
                  <div><span className="text-slate-500">Table:</span> <strong className="font-mono">{parseResult.parsed.table_name}</strong></div>
                  <div><span className="text-slate-500">Database:</span> <strong>{DEFAULT_DATABASE}</strong></div>
                  <div><span className="text-slate-500">Rows:</span> <strong>{parseResult.parsed.row_count}</strong></div>
                  <div><span className="text-slate-500">Columns:</span> <span className="font-mono text-xs">{parseResult.parsed.columns.join(', ')}</span></div>
                </div>

                {parseResult.warnings.map((w, i) => (
                  <div key={i} className="mt-3"><Alert type="info" message={w} /></div>
                ))}

                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-xs border border-slate-200">
                    <thead>
                      <tr className="bg-slate-50">
                        {parseResult.parsed.columns.map((col) => (
                          <th key={col} className="px-2 py-1 text-left font-medium">{col}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {parseResult.parsed.rows.map((row, i) => (
                        <tr key={i} className="border-t border-slate-100">
                          {row.map((val, j) => (
                            <td key={j} className="px-2 py-1 font-mono">{val}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>

              <Card className="p-6">
                <h3 className="font-semibold text-slate-900 mb-3">Generated SQL</h3>
                <pre className="bg-slate-900 text-green-300 rounded-lg p-4 text-xs overflow-x-auto whitespace-pre-wrap max-h-64">
                  {parseResult.sql}
                </pre>
              </Card>
            </>
          ) : (
            <Card className="p-6">
              <h3 className="font-semibold text-slate-900 mb-2">How it works</h3>
              <ol className="text-sm text-slate-600 space-y-2 list-decimal list-inside">
                <li>Pick any POS to load tables (all POS have same database)</li>
                <li>Select the <strong>table</strong> you want to modify</li>
                <li>Paste only the <strong>data rows</strong></li>
                <li>Click <strong>Deploy to All POS</strong></li>
              </ol>
            </Card>
          )}

          {job && (() => {
            const targets = deployAll ? activePos : activePos.filter(p => selectedPos.includes(p.id));
            const pendingTargets = targets.filter(t => !job.results?.find(r => r.pos_name === t.name));
            const currentRunningId = job.status === 'running' ? pendingTargets[0]?.id : null;

            const total = targets.length;
            const done = job.results ? job.results.filter(r => r.success || !r.success).length : 0;
            const percent = total > 0 ? (done / total) * 100 : 0;

            return (
              <Card className="fixed bottom-6 right-6 w-96 p-4 shadow-2xl border border-slate-200 z-50 bg-white max-h-96 overflow-y-auto">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-slate-900">Deploy Progress</h3>
                  {(job.status === 'completed' || job.status === 'failed') && (
                    <Button size="sm" variant="ghost" onClick={() => setJob(null)}>Dismiss</Button>
                  )}
                </div>

                <div className="mb-4">
                  <div className="flex justify-between text-xs text-slate-500 mb-1">
                    <span>{done} / {total} Completed</span>
                    <span>{Math.round(percent)}%</span>
                  </div>
                  <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                    <div className="bg-brand-600 h-full transition-all duration-300" style={{ width: `${percent}%` }} />
                  </div>
                </div>

                <div className="flex items-center gap-2 mb-3">
                  <Badge status={job.status} />
                  <span className="text-sm">{job.script_name}</span>
                </div>
                {(job.status === 'completed' || job.status === 'failed') && (
                  <Alert
                    type={job.status === 'completed' ? 'success' : 'error'}
                    message={`${successCount} succeeded, ${failCount} failed`}
                  />
                )}
                <ul className="mt-4 text-sm space-y-3">
                  {targets.map((pos) => {
                    const res = job.results?.find(r => r.pos_name === pos.name);
                    const isRunning = currentRunningId === pos.id;
                    return (
                      <li key={pos.id} className="flex justify-between items-center border-b border-slate-100 pb-2">
                        <span className="font-medium text-slate-700">{pos.name}</span>
                        {res ? (
                          <Badge status={res.success ? 'completed' : 'failed'} />
                        ) : isRunning ? (
                          <div className="flex items-center gap-1.5 text-xs text-blue-600 font-medium">
                            <span className="inline-block w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                            Working
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400 font-medium px-2 py-0.5 bg-slate-100 rounded-md">Pending</span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </Card>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
