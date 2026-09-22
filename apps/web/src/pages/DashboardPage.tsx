import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import type { DashboardStats } from '../types';
import { Alert, Badge, Card, PageHeader, StatCard } from '../components/ui';

export function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.getDashboard()
      .then(setStats)
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <Alert type="error" message={error} />;

  if (!stats) {
    return <div className="text-slate-500">Loading dashboard...</div>;
  }

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Overview of your POS deployment environment"
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Total POS Machines" value={stats.totalPos} sub={`${stats.activePos} active`} />
        <StatCard label="SQL Scripts" value={stats.totalScripts} />
        <StatCard label="Total Deploys" value={stats.totalDeploys} />
        <StatCard
          label="Last Deploy"
          value={stats.lastDeploy ? stats.lastDeploy.script_name ?? '—' : 'None'}
          sub={stats.lastDeploy?.started_at ? new Date(stats.lastDeploy.started_at + 'Z').toLocaleString() : undefined}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-6">
          <h3 className="font-semibold text-slate-900 mb-4">Quick Start</h3>
          <ol className="space-y-3 text-sm text-slate-600 list-decimal list-inside">
            <li><Link to="/pos" className="text-brand-600 hover:underline font-medium">Discover and Add POS machines</Link> (Auto-scan network for devices)</li>
            <li><Link to="/debug" className="text-brand-600 hover:underline font-medium">Debug Changing</Link> (Upload Debug.rar to update frontend on all POS)</li>
            <li><Link to="/paste" className="text-brand-600 hover:underline font-medium">Paste Instructions</Link> (Easily deploy boss instructions like "Add record...")</li>
            <li><Link to="/schema" className="text-brand-600 hover:underline font-medium">Schema Builder</Link> (Visually create tables or add columns)</li>
            <li><Link to="/scripts" className="text-brand-600 hover:underline font-medium">Manage Scripts</Link> and <Link to="/history" className="text-brand-600 hover:underline font-medium">View History</Link></li>
          </ol>
        </Card>

        <Card className="p-6">
          <h3 className="font-semibold text-slate-900 mb-4">Last Deploy Status</h3>
          {stats.lastDeploy ? (
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-slate-500">Script:</span>
                <span className="font-medium">{stats.lastDeploy.script_name}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-slate-500">Status:</span>
                <Badge status={stats.lastDeploy.status} />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-slate-500">POS count:</span>
                <span>{stats.lastDeploy.pos_count}</span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-500">No deploys yet. Start by adding POS machines.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
