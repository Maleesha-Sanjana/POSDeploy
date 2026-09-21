import { useEffect, useState } from 'react';

import { api } from '../api/client';
import type { PosMachine } from '../types';
import {
  Alert,
  Badge,
  Button,
  Card,
  Input,
  Modal,
  PageHeader,
} from '../components/ui';

export function PosPage() {
  const [posList, setPosList] = useState<PosMachine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [deviceName, setDeviceName] = useState('');
  const [editId, setEditId] = useState<number | null>(null);
  const [testingId, setTestingId] = useState<number | null>(null);
  const [testResult, setTestResult] = useState<{ id: number; message: string; success: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [discovering, setDiscovering] = useState(false);
  const [discoveredDevices, setDiscoveredDevices] = useState<{name: string, ip: string, mac: string}[] | null>(null);
  const [addingDevices, setAddingDevices] = useState<{name: string; ip: string; status: 'pending' | 'running' | 'completed' | 'failed', error?: string}[] | null>(null);
  const [manualPassword, setManualPassword] = useState('');
  const [showManualPassword, setShowManualPassword] = useState(false);

  const load = () => {
    setLoading(true);
    api.getPos()
      .then((pos) => {
        setPosList(pos);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const openAdd = (withPassword = false) => {
    setEditId(null);
    setDeviceName('');
    setManualPassword('');
    setShowManualPassword(withPassword);
    setModalOpen(true);
  };

  const openEdit = (pos: PosMachine) => {
    setEditId(pos.id);
    setDeviceName(pos.name);
    setManualPassword('');
    setShowManualPassword(false);
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    try {
      if (editId) {
        await api.updatePos(editId, { device_name: deviceName.trim(), password: manualPassword || undefined });
      } else {
        await api.createPos({ device_name: deviceName.trim(), password: manualPassword || undefined });
      }
      setModalOpen(false);
      load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Save failed';
      setError(msg);
      if (msg.toLowerCase().includes('manually')) {
        setShowManualPassword(true);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`Delete POS machine "${name}"?`)) return;
    setDeletingId(id);
    setError('');
    try {
      await api.deletePos(id);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeletingId(null);
    }
  };

  const handleTest = async (id: number) => {
    setTestingId(id);
    setTestResult(null);
    try {
      const result = await api.testPos(id);
      setTestResult({ id, message: result.message, success: result.success });
      load();
    } catch (err) {
      setTestResult({
        id,
        message: err instanceof Error ? err.message : 'Test failed',
        success: false,
      });
    } finally {
      setTestingId(null);
    }
  };

  const handleDiscover = async () => {
    setDiscovering(true);
    setError('');
    try {
      const devices = await api.discoverPos();
      const existingNames = new Set(posList.map(p => p.name.toLowerCase()));
      const filtered = devices.filter(d => !existingNames.has(d.name.toLowerCase()) && !existingNames.has(d.ip));
      
      if (filtered.length === 0) {
        setDiscoveredDevices([]);
        setAddingDevices(null);
        return;
      }

      setAddingDevices(filtered.map(d => ({
        name: d.name !== '?' ? d.name : d.ip,
        ip: d.ip,
        status: 'pending'
      })));

      const manualDevices: typeof devices = [];
      let addedCount = 0;

      await Promise.allSettled(
        filtered.map(async (dev) => {
          setAddingDevices(prev => prev ? prev.map(p => p.ip === dev.ip ? { ...p, status: 'running' } : p) : null);
          try {
            await api.createPos({ device_name: dev.name !== '?' ? dev.name : dev.ip });
            addedCount++;
            setAddingDevices(prev => prev ? prev.map(p => p.ip === dev.ip ? { ...p, status: 'completed' } : p) : null);
          } catch (err) {
            const msg = err instanceof Error ? err.message : 'Failed to connect';
            setAddingDevices(prev => prev ? prev.map(p => p.ip === dev.ip ? { ...p, status: 'failed', error: msg } : p) : null);
            if (msg.toLowerCase().includes('manually')) {
              manualDevices.push(dev);
            }
          }
        })
      );

      setDiscoveredDevices(manualDevices);
      if (addedCount > 0) {
        load();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Discovery failed');
    } finally {
      setDiscovering(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="POS Discovering"
        description="Auto-discover machines on the LAN or manually add POS devices to test connections"
        action={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={handleDiscover} disabled={discovering}>
              {discovering ? 'Scanning...' : 'Scan Network'}
            </Button>
            <Button onClick={() => openAdd()}>
              + Add POS
            </Button>
          </div>
        }
      />

      {error && <div className="mb-4"><Alert type="error" message={error} /></div>}

      {addingDevices !== null && (() => {
        const total = addingDevices.length;
        const done = addingDevices.filter(d => d.status === 'completed' || d.status === 'failed').length;
        const percent = total > 0 ? (done / total) * 100 : 0;
        
        return (
          <Card className="fixed bottom-6 right-6 w-96 p-4 shadow-2xl border border-slate-200 z-50 bg-white max-h-96 overflow-y-auto">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-slate-900">Deploy Progress (Adding POS)</h3>
              {!discovering && <Button size="sm" variant="ghost" onClick={() => setAddingDevices(null)}>Dismiss</Button>}
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

            <ul className="text-sm space-y-2">
              {addingDevices.map((d) => (
                <li key={d.ip} className="flex flex-col gap-0.5 border-b border-slate-100 pb-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-700">{d.name} ({d.ip})</span>
                    {d.status === 'pending' && <span className="text-xs text-slate-400 font-medium px-2 py-0.5 bg-slate-100 rounded-md">Pending</span>}
                    {d.status === 'running' && (
                      <div className="flex items-center gap-1.5 text-xs text-blue-600 font-medium">
                        <span className="inline-block w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                        Connecting
                      </div>
                    )}
                    {d.status === 'completed' && <Badge status="completed" />}
                    {d.status === 'failed' && <Badge status="failed" />}
                  </div>
                  {d.error && (
                    <p className="text-xs text-red-600 font-mono mt-1 break-words">
                      {d.error}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        );
      })()}

      {testResult && (
        <div className="mb-4">
          <Alert type={testResult.success ? 'success' : 'error'} message={testResult.message} />
        </div>
      )}

      {discoveredDevices !== null && (
        <Card className="mb-6 p-6 border-brand-200 bg-brand-50/30">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-slate-900">Scan Complete</h3>
            <Button size="sm" variant="ghost" onClick={() => setDiscoveredDevices(null)}>Close</Button>
          </div>
          {discoveredDevices.length === 0 ? (
            <p className="text-sm text-slate-600">All reachable POS machines have been automatically added!</p>
          ) : (
            <div>
              <p className="text-sm text-amber-700 mb-4 font-medium">The following devices were found but require a manual password:</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {discoveredDevices.map((dev) => (
                  <div key={dev.mac} className="relative flex items-center justify-between p-3 pr-8 border border-slate-200 rounded-lg bg-white shadow-sm">
                    <button 
                      onClick={() => setDiscoveredDevices(prev => prev ? prev.filter(d => d.mac !== dev.mac) : null)}
                      className="absolute top-1.5 right-1.5 text-slate-400 hover:text-red-500 transition-colors p-1 rounded-md"
                      title="Dismiss"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                    </button>
                    <div className="min-w-0 flex-1 pr-2">
                      <div className="font-medium text-slate-900 text-sm truncate" title={dev.name !== '?' ? dev.name : dev.ip}>
                        {dev.name !== '?' ? dev.name : dev.ip}
                      </div>
                      <div className="text-xs text-slate-500 font-mono mt-0.5 truncate">{dev.ip}</div>
                    </div>
                    <Button size="sm" className="shrink-0" onClick={() => {
                      openAdd(true);
                      setDeviceName(dev.name !== '?' ? dev.name : dev.ip);
                    }}>
                      Add Manually
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}

      <Card>
        {loading ? (
          <div className="p-8 text-center text-slate-500">Loading...</div>
        ) : posList.length === 0 ? (
          <div className="p-8 text-center text-slate-500">
            No POS machines yet. Click "+ Add POS" and enter a Device Name like POS1.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Device Name</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Status</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600">Actions</th>
                </tr>
              </thead>
              <tbody>
                {posList.map((pos) => (
                  <tr key={pos.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium font-mono">{pos.name}</td>
                    <td className="px-4 py-3">
                      <Badge status={pos.is_active ? 'active' : 'inactive'} />
                    </td>
                    <td className="px-4 py-3 text-right space-x-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleTest(pos.id)}
                        disabled={testingId === pos.id}
                      >
                        {testingId === pos.id ? 'Testing...' : 'Test'}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => openEdit(pos)}>
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => handleDelete(pos.id, pos.name)}
                        disabled={deletingId === pos.id}
                      >
                        {deletingId === pos.id ? 'Deleting...' : 'Delete'}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editId ? 'Edit POS Machine' : 'Add POS Machine'}>
        <form onSubmit={handleSave} className="space-y-4">
          {error && <Alert type="error" message={error} />}
          <Input
            label="Device Name"
            value={deviceName}
            onChange={(e) => setDeviceName(e.target.value)}
            required
            placeholder="POS1"
            autoFocus
          />
          {showManualPassword && (
            <Input
              label="SQL Password (sa)"
              type="password"
              value={manualPassword}
              onChange={(e) => setManualPassword(e.target.value)}
              required
              placeholder="Enter password manually"
            />
          )}
          <p className="text-xs text-slate-500">
            The connection will be tested automatically using default passwords. Status shows
            <strong> active</strong> if the POS responds on port 1433, or
            <strong> inactive</strong> if it cannot be reached.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={saving || !deviceName.trim()}>
              {saving ? 'Adding & Testing...' : 'Save'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
