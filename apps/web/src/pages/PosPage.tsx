import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
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
  const [passwordReady, setPasswordReady] = useState<boolean | null>(null);

  const load = () => {
    setLoading(true);
    Promise.all([api.getPos(), api.canAddPos()])
      .then(([pos, { ready }]) => {
        setPosList(pos);
        setPasswordReady(ready);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const openAdd = () => {
    if (!passwordReady) return;
    setEditId(null);
    setDeviceName('');
    setModalOpen(true);
  };

  const openEdit = (pos: PosMachine) => {
    setEditId(pos.id);
    setDeviceName(pos.name);
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    try {
      if (editId) {
        await api.updatePos(editId, { device_name: deviceName.trim() });
      } else {
        await api.createPos({ device_name: deviceName.trim() });
      }
      setModalOpen(false);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`Delete POS machine "${name}"?`)) return;
    try {
      await api.deletePos(id);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
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

  return (
    <div>
      <PageHeader
        title="POS Machines"
        description="Add each POS by Device Name. Status shows active only when connection to the POS is successful."
        action={
          <Button onClick={openAdd} disabled={!passwordReady}>
            + Add POS
          </Button>
        }
      />

      {passwordReady === false && (
        <div className="mb-4">
          <Alert type="error" message="POS password is not set. You must configure it before adding POS machines." />
          <Link to="/pos-password" className="inline-block mt-2 text-sm text-brand-600 hover:underline font-medium">
            Go to POS Password Setting →
          </Link>
        </div>
      )}

      {error && <div className="mb-4"><Alert type="error" message={error} /></div>}

      {testResult && (
        <div className="mb-4">
          <Alert type={testResult.success ? 'success' : 'error'} message={testResult.message} />
        </div>
      )}

      <Card>
        {loading ? (
          <div className="p-8 text-center text-slate-500">Loading...</div>
        ) : posList.length === 0 ? (
          <div className="p-8 text-center text-slate-500">
            {passwordReady
              ? 'No POS machines yet. Click "+ Add POS" and enter a Device Name like POS1.'
              : 'Set the POS password first, then add POS machines here.'}
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
                      <Button size="sm" variant="ghost" onClick={() => openEdit(pos)}>Edit</Button>
                      <Button size="sm" variant="danger" onClick={() => handleDelete(pos.id, pos.name)}>Delete</Button>
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
          <Input
            label="Device Name"
            value={deviceName}
            onChange={(e) => setDeviceName(e.target.value)}
            required
            placeholder="POS1"
            autoFocus
          />
          <p className="text-xs text-slate-500">
            The connection will be tested automatically. Status will show
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
