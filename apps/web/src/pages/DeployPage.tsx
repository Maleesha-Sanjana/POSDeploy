import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import type { DeployJob, PosMachine, Script } from '../types';
import {
  Alert,
  Badge,
  Button,
  Card,
  PageHeader,
} from '../components/ui';

export function DeployPage() {
  const [scripts, setScripts] = useState<Script[]>([]);
  const [posList, setPosList] = useState<PosMachine[]>([]);
  const [selectedScript, setSelectedScript] = useState<number | ''>('');
  const [selectedPos, setSelectedPos] = useState<number[]>([]);
  const [deployAll, setDeployAll] = useState(true);
  const [deploying, setDeploying] = useState(false);
  const [error, setError] = useState('');
  const [job, setJob] = useState<DeployJob | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    Promise.all([api.getScripts(), api.getPos()])
      .then(([s, p]) => {
        setScripts(s);
        setPosList(p.filter((x) => x.is_active));
      })
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

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

  const handleDeploy = async () => {
    if (!selectedScript) {
      setError('Please select a script');
      return;
    }

    if (!deployAll && selectedPos.length === 0) {
      setError('Please select at least one POS machine');
      return;
    }

    setError('');
    setDeploying(true);
    setJob(null);

    try {
      const { jobId } = await api.startDeploy({
        script_id: Number(selectedScript),
        pos_ids: deployAll ? 'all' : selectedPos,
      });

      const initial = await api.getDeployJob(jobId);
      setJob(initial);
      pollJob(jobId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Deploy failed');
      setDeploying(false);
    }
  };

  const activePos = posList.filter((p) => p.is_active);
  const successCount = job?.results?.filter((r) => r.success).length ?? 0;
  const failCount = job?.results?.filter((r) => !r.success).length ?? 0;

  return (
    <div>
      <PageHeader
        title="Deploy"
        description="Run a SQL script on all or selected POS machines at once"
      />

      {error && <div className="mb-4"><Alert type="error" message={error} /></div>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-6 space-y-5">
          <div>
            <label className="text-sm font-medium text-slate-700">Select Script</label>
            <select
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              value={selectedScript}
              onChange={(e) => setSelectedScript(e.target.value ? Number(e.target.value) : '')}
              disabled={deploying}
            >
              <option value="">— Choose a script —</option>
              {scripts.map((s) => (
                <option key={s.id} value={s.id}>{s.name} ({s.script_type})</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700 mb-2 block">Target POS Machines</label>
            <label className="flex items-center gap-2 mb-3">
              <input
                type="radio"
                checked={deployAll}
                onChange={() => setDeployAll(true)}
                disabled={deploying}
              />
              <span className="text-sm">All active POS ({activePos.length})</span>
            </label>
            <label className="flex items-center gap-2 mb-3">
              <input
                type="radio"
                checked={!deployAll}
                onChange={() => setDeployAll(false)}
                disabled={deploying}
              />
              <span className="text-sm">Selected POS only</span>
            </label>

            {!deployAll && (
              <div className="border border-slate-200 rounded-lg p-3 space-y-2 max-h-48 overflow-y-auto">
                {activePos.map((pos) => (
                  <label key={pos.id} className="flex items-center gap-2 text-sm">
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
          </div>

          <Button
            onClick={handleDeploy}
            disabled={deploying || !selectedScript}
            className="w-full"
          >
            {deploying ? 'Deploying...' : 'Deploy Now'}
          </Button>
        </Card>

        <Card className="p-6">
          <h3 className="font-semibold text-slate-900 mb-4">Deploy Progress</h3>

          {!job ? (
            <p className="text-sm text-slate-500">Select a script and click Deploy to start.</p>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Badge status={job.status} />
                <span className="text-sm text-slate-600">{job.script_name}</span>
              </div>

              {job.status === 'running' && (
                <div className="flex items-center gap-2 text-sm text-blue-600">
                  <span className="inline-block w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                  Running on POS machines...
                </div>
              )}

              {(job.status === 'completed' || job.status === 'failed') && (
                <Alert
                  type={job.status === 'completed' ? 'success' : 'error'}
                  message={`Done — ${successCount} succeeded, ${failCount} failed`}
                />
              )}

              {job.results && job.results.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200">
                        <th className="text-left py-2 font-medium text-slate-600">POS</th>
                        <th className="text-left py-2 font-medium text-slate-600">Status</th>
                        <th className="text-left py-2 font-medium text-slate-600">Time</th>
                        <th className="text-left py-2 font-medium text-slate-600">Error</th>
                      </tr>
                    </thead>
                    <tbody>
                      {job.results.map((r) => (
                        <tr key={r.id} className="border-b border-slate-100">
                          <td className="py-2 font-medium">{r.pos_name}</td>
                          <td className="py-2">
                            <Badge status={r.success ? 'completed' : 'failed'} />
                          </td>
                          <td className="py-2 text-slate-500">{r.duration_ms}ms</td>
                          <td className="py-2 text-red-600 text-xs max-w-xs truncate">
                            {r.error_message ?? '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
