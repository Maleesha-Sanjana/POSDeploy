import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import type { PosMachine } from '../types';
import {
  Alert,
  Badge,
  Button,
  Card,
  PageHeader,
} from '../components/ui';

export function DebugPage() {
  const [allPos, setAllPos] = useState<PosMachine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  const [file, setFile] = useState<File | null>(null);
  const [deployAll, setDeployAll] = useState(true);
  const [selectedPos, setSelectedPos] = useState<number[]>([]);
  
  const [deploying, setDeploying] = useState(false);
  const [results, setResults] = useState<{ pos_id: number; pos_name: string; status: 'pending'|'running'|'completed'|'failed'; error?: string }[] | null>(null);

  const activePos = allPos.filter(p => p.is_active);

  useEffect(() => {
    api.getPos()
      .then(setAllPos)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const togglePos = (id: number) => {
    setSelectedPos((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
    }
  };

  const handleDeploy = async () => {
    if (!file) {
      setError('Please select a Debug.rar file first.');
      return;
    }

    if (!deployAll && selectedPos.length === 0) {
      setError('Select at least one POS machine.');
      return;
    }

    setError('');
    setResults(null);
    setDeploying(true);

    try {
      const uploadRes = await api.uploadDebug(file);
      const targets = deployAll ? activePos : activePos.filter(p => selectedPos.includes(p.id));
      
      const initialResults = targets.map(t => ({
        pos_id: t.id,
        pos_name: t.name,
        status: 'pending' as const
      }));
      setResults(initialResults);

      for (const t of targets) {
        setResults(prev => prev!.map(r => r.pos_id === t.id ? { ...r, status: 'running' } : r));
        try {
          const res = await api.deployDebug({ filename: uploadRes.filename, pos_ids: [t.id] });
          const success = res.results[0]?.success;
          const error = res.results[0]?.error;
          setResults(prev => prev!.map(r => r.pos_id === t.id ? { ...r, status: success ? 'completed' : 'failed', error } : r));
        } catch (e) {
          setResults(prev => prev!.map(r => r.pos_id === t.id ? { ...r, status: 'failed', error: e instanceof Error ? e.message : 'Unknown error' } : r));
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Deployment failed');
    } finally {
      setDeploying(false);
    }
  };

  const successCount = results?.filter(r => r.status === 'completed').length ?? 0;
  const failCount = results?.filter(r => r.status === 'failed').length ?? 0;

  return (
    <div>
      <PageHeader
        title="Debug Changing"
        description="Upload a new Debug.rar to automatically extract and update the frontend on POS machines"
      />

      {error && <div className="mb-4"><Alert type="error" message={error} /></div>}

      <div className="max-w-2xl gap-6 space-y-6">
        <div className="space-y-4">
          <Card className="p-6 space-y-4">
            <h3 className="font-semibold text-slate-900">1. Upload Debug.rar</h3>
            <p className="text-sm text-slate-500">
              Select the new <code className="font-mono text-pink-600 bg-pink-50 px-1 py-0.5 rounded">Debug.rar</code> file to distribute. WinRAR must be installed on the POS machines.
            </p>
            
            <div className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center hover:bg-slate-50 transition-colors">
              <input
                type="file"
                accept=".rar"
                onChange={handleFileChange}
                className="hidden"
                id="debug-file"
                disabled={deploying}
              />
              <label htmlFor="debug-file" className="cursor-pointer flex flex-col items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>
                <span className="font-medium text-brand-600">Browse for file</span>
                <span className="text-xs text-slate-500">
                  {file ? <span className="text-slate-900 font-medium">{file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)</span> : 'No file selected'}
                </span>
              </label>
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="font-semibold text-slate-900 mb-3">2. Target POS Machines</h3>
            {loading ? (
              <p className="text-sm text-slate-500">Loading...</p>
            ) : activePos.length === 0 ? (
              <p className="text-sm text-slate-500">No active POS machines. <Link to="/pos" className="text-brand-600">Add them here</Link>.</p>
            ) : (
              <>
                <label className="flex items-center gap-2 mb-2 text-sm cursor-pointer">
                  <input type="radio" checked={deployAll} onChange={() => setDeployAll(true)} disabled={deploying} />
                  All active POS ({activePos.length})
                </label>
                <label className="flex items-center gap-2 mb-2 text-sm cursor-pointer">
                  <input type="radio" checked={!deployAll} onChange={() => setDeployAll(false)} disabled={deploying} />
                  Selected POS only
                </label>
                {!deployAll && (
                  <div className="border border-slate-200 rounded-lg p-3 space-y-2 max-h-48 overflow-y-auto mt-2">
                    {activePos.map((pos) => (
                      <label key={pos.id} className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedPos.includes(pos.id)}
                          onChange={() => togglePos(pos.id)}
                          disabled={deploying}
                        />
                        {pos.name}
                      </label>
                    ))}
                  </div>
                )}
              </>
            )}
            
            <div className="mt-6 pt-4 border-t border-slate-100">
              <Button 
                onClick={handleDeploy} 
                disabled={deploying || !file || activePos.length === 0} 
                className="w-full"
              >
                {deploying ? 'Deploying to POS...' : 'Deploy Debug.rar to POS'}
              </Button>
            </div>
          </Card>
        </div>
      </div>

      {(results || deploying) && (() => {
        const total = results ? results.length : activePos.length;
        const done = results ? results.filter(r => r.status === 'completed' || r.status === 'failed').length : 0;
        const percent = total > 0 ? (done / total) * 100 : 0;

        return (
          <Card className="fixed bottom-6 right-6 w-96 p-4 shadow-2xl border border-slate-200 z-50 bg-white max-h-96 overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-900">Deployment Status</h3>
              {!deploying && <Button size="sm" variant="ghost" onClick={() => setResults(null)}>Dismiss</Button>}
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
          
          {deploying && !results && (
            <div className="flex items-center gap-3 text-brand-600 mb-2">
              <span className="inline-block w-5 h-5 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
              <span className="font-medium">Uploading to server...</span>
            </div>
          )}

          {results && (
            <div className="space-y-4">
              {(!deploying && failCount > 0) ? (
                <Alert type="error" message={`${successCount} machines succeeded, ${failCount} failed`} />
              ) : (!deploying && successCount > 0) ? (
                <Alert type="success" message={`All ${successCount} machines successfully updated!`} />
              ) : (
                <Alert type="info" message={`Deploying to ${results.length} machines...`} />
              )}
              
              <ul className="text-sm space-y-3">
                {results.map((r) => (
                  <li key={r.pos_id} className="border-b border-slate-100 pb-2">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-slate-900">{r.pos_name}</span>
                      {r.status === 'pending' && <span className="text-xs text-slate-400 font-medium px-2 py-0.5 bg-slate-100 rounded-md">Pending</span>}
                      {r.status === 'running' && (
                        <div className="flex items-center gap-1.5 text-xs text-blue-600 font-medium">
                          <span className="inline-block w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                          Working...
                        </div>
                      )}
                      {r.status === 'completed' && <Badge status="completed" />}
                      {r.status === 'failed' && <Badge status="failed" />}
                    </div>
                    {r.error && (
                      <p className="text-xs text-red-600 font-mono mt-1 break-words">
                        {r.error}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          </Card>
        );
      })()}
    </div>
  );
}
