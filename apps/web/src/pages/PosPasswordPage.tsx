import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import type { PosCredentialsPublic } from '../types';
import { Alert, Button, Card, Input, PageHeader } from '../components/ui';

const DEFAULT_DATABASE_NAME = 'POS_SOLUTION';

export function PosPasswordPage() {
  const [settings, setSettings] = useState<PosCredentialsPublic | null>(null);
  const [databaseName, setDatabaseName] = useState(DEFAULT_DATABASE_NAME);
  const [username, setUsername] = useState('sa');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = () => {
    setLoading(true);
    api.getPosCredentials()
      .then((data) => {
        setSettings(data);
        setDatabaseName(data.database_name || DEFAULT_DATABASE_NAME);
        setUsername(data.username || 'sa');
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setSaving(true);

    try {
      const result = await api.savePosCredentials({
        database_name: databaseName.trim(),
        username: username.trim() || 'sa',
        password,
      });
      setSettings(result);
      setPassword('');
      setSuccess(result.message ?? 'POS password saved successfully.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="POS Password Setting"
        description="Set the shared SQL login used by all POS machines. Username defaults to sa. All POS databases use the same password."
      />

      {error && <div className="mb-4"><Alert type="error" message={error} /></div>}
      {success && <div className="mb-4"><Alert type="success" message={success} /></div>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="p-6 lg:col-span-2">
          {loading ? (
            <div className="text-slate-500 text-sm">Loading settings...</div>
          ) : (
            <form onSubmit={handleSave} className="space-y-5">
              <Input
                label="Database Name"
                value={databaseName}
                onChange={(e) => setDatabaseName(e.target.value)}
                placeholder="POS_SOLUTION"
                required
                disabled={saving}
              />
              <Input
                label="SQL Username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="sa"
                required
                disabled={saving}
              />
              <Input
                label="POS Password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={settings?.has_password ? 'Enter new password to update' : 'Enter POS SQL password'}
                required
                disabled={saving}
              />
              <p className="text-xs text-slate-500">
                This password is the same on every POS machine. After saving, all registered POS machines will use these credentials.
              </p>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="submit" disabled={saving || !password.trim()}>
                  {saving ? 'Saving...' : 'Save POS Password'}
                </Button>
              </div>
            </form>
          )}
        </Card>

        <Card className="p-6">
          <h3 className="font-semibold text-slate-900 mb-4">Current Status</h3>
          {settings ? (
            <div className="space-y-3 text-sm">
              <div>
                <span className="text-slate-500">Database:</span>
                <p className="font-medium">{settings.database_name || DEFAULT_DATABASE_NAME}</p>
              </div>
              <div>
                <span className="text-slate-500">Username:</span>
                <p className="font-medium">{settings.username || 'sa'}</p>
              </div>
              <div>
                <span className="text-slate-500">Password:</span>
                <p className="font-medium">{settings.has_password ? 'Configured' : 'Not set'}</p>
              </div>
              {settings.updated_at && (
                <div>
                  <span className="text-slate-500">Last updated:</span>
                  <p className="font-medium">{new Date(settings.updated_at).toLocaleString()}</p>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-slate-500">No credentials saved yet.</p>
          )}

          <div className="mt-6 pt-4 border-t border-slate-200">
            <p className="text-xs text-slate-500 mb-2">Next step after saving password:</p>
            <Link to="/pos" className="text-sm text-brand-600 hover:underline">
              Add POS Machines →
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
