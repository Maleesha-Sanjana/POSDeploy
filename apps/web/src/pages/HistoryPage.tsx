import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { DeployJob } from '../types';
import { Alert, Badge, Card, PageHeader } from '../components/ui';

export function HistoryPage() {
  const [jobs, setJobs] = useState<DeployJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    api.getDeployHistory()
      .then(setJobs)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <PageHeader
        title="Deploy History"
        description="Past deployment runs and per-POS results"
      />

      {error && <div className="mb-4"><Alert type="error" message={error} /></div>}

      <Card>
        {loading ? (
          <div className="p-8 text-center text-slate-500">Loading...</div>
        ) : jobs.length === 0 ? (
          <div className="p-8 text-center text-slate-500">No deploy history yet.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {jobs.map((job) => {
              const successCount = job.results?.filter((r) => r.success).length ?? 0;
              const failCount = job.results?.filter((r) => !r.success).length ?? 0;
              const isExpanded = expanded === job.id;

              return (
                <div key={job.id} className="p-4">
                  <button
                    className="w-full flex items-center justify-between text-left"
                    onClick={() => setExpanded(isExpanded ? null : job.id)}
                  >
                    <div className="flex items-center gap-3">
                      <Badge status={job.status} />
                      <span className="font-medium text-slate-900">{job.script_name}</span>
                      <span className="text-sm text-slate-500">
                        {job.pos_count} POS · {successCount} ok / {failCount} fail
                      </span>
                    </div>
                    <span className="text-sm text-slate-400">
                      {new Date(job.started_at + 'Z').toLocaleString()}
                    </span>
                  </button>

                  {isExpanded && job.results && (
                    <div className="mt-4 overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-50">
                            <th className="text-left px-3 py-2 font-medium text-slate-600">POS</th>
                            <th className="text-left px-3 py-2 font-medium text-slate-600">Status</th>
                            <th className="text-left px-3 py-2 font-medium text-slate-600">Duration</th>
                            <th className="text-left px-3 py-2 font-medium text-slate-600">Error</th>
                          </tr>
                        </thead>
                        <tbody>
                          {job.results.map((r) => (
                            <tr key={r.id} className="border-b border-slate-100">
                              <td className="px-3 py-2 font-medium">{r.pos_name}</td>
                              <td className="px-3 py-2">
                                <Badge status={r.success ? 'completed' : 'failed'} />
                              </td>
                              <td className="px-3 py-2 text-slate-500">{r.duration_ms}ms</td>
                              <td className="px-3 py-2 text-red-600 text-xs">{r.error_message ?? '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
