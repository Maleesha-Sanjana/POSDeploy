import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { Script } from '../types';
import {
  Alert,
  Badge,
  Button,
  Card,
  Input,
  Modal,
  PageHeader,
  Select,
  Textarea,
} from '../components/ui';

const emptyForm = {
  name: '',
  description: '',
  sql_text: '',
  script_type: 'data' as 'schema' | 'data',
};

export function ScriptsPage() {
  const [scripts, setScripts] = useState<Script[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [viewScript, setViewScript] = useState<Script | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    api.getScripts()
      .then(setScripts)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const openAdd = () => {
    setEditId(null);
    setForm(emptyForm);
    setModalOpen(true);
  };

  const openEdit = (script: Script) => {
    setEditId(script.id);
    setForm({
      name: script.name,
      description: script.description,
      sql_text: script.sql_text,
      script_type: script.script_type,
    });
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    try {
      if (editId) {
        await api.updateScript(editId, form);
      } else {
        await api.createScript(form);
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
    if (!confirm(`Delete script "${name}"?`)) return;
    try {
      await api.deleteScript(id);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  return (
    <div>
      <PageHeader
        title="SQL Scripts"
        description="Manage schema changes and data inserts for all POS databases"
        action={<Button onClick={openAdd}>+ New Script</Button>}
      />

      {error && <div className="mb-4"><Alert type="error" message={error} /></div>}

      <Card>
        {loading ? (
          <div className="p-8 text-center text-slate-500">Loading...</div>
        ) : scripts.length === 0 ? (
          <div className="p-8 text-center text-slate-500">No scripts yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Name</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Type</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Description</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Created</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600">Actions</th>
                </tr>
              </thead>
              <tbody>
                {scripts.map((script) => (
                  <tr key={script.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium">{script.name}</td>
                    <td className="px-4 py-3"><Badge status={script.script_type} /></td>
                    <td className="px-4 py-3 text-slate-600 max-w-xs truncate">{script.description}</td>
                    <td className="px-4 py-3 text-slate-500">
                      {new Date(script.created_at + 'Z').toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right space-x-2">
                      <Button size="sm" variant="secondary" onClick={() => setViewScript(script)}>View</Button>
                      <Button size="sm" variant="ghost" onClick={() => openEdit(script)}>Edit</Button>
                      <Button size="sm" variant="danger" onClick={() => handleDelete(script.id, script.name)}>Delete</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editId ? 'Edit Script' : 'New Script'}>
        <form onSubmit={handleSave} className="space-y-4">
          <Input
            label="Script Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
            placeholder="gen_usergroup_levels"
          />
          <Input
            label="Description"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Add Level 1/2/3 records"
          />
          <Select
            label="Type"
            value={form.script_type}
            onChange={(e) => setForm({ ...form, script_type: e.target.value as 'schema' | 'data' })}
          >
            <option value="data">Data (INSERT/UPDATE)</option>
            <option value="schema">Schema (ALTER TABLE)</option>
          </Select>
          <Textarea
            label="SQL"
            value={form.sql_text}
            onChange={(e) => setForm({ ...form, sql_text: e.target.value })}
            required
            rows={12}
            placeholder="IF NOT EXISTS (...) BEGIN ... END"
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
          </div>
        </form>
      </Modal>

      <Modal open={!!viewScript} onClose={() => setViewScript(null)} title={viewScript?.name ?? 'Script'}>
        {viewScript && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">{viewScript.description}</p>
            <pre className="bg-slate-900 text-green-300 rounded-lg p-4 text-xs overflow-x-auto whitespace-pre-wrap">
              {viewScript.sql_text}
            </pre>
          </div>
        )}
      </Modal>
    </div>
  );
}
