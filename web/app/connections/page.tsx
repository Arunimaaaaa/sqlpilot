'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../../lib/api';
import {
  Server,
  Plus,
  Trash2,
  CheckCircle2,
  XCircle,
  ShieldCheck,
  Key,
  Network,
  RefreshCw,
  ExternalLink,
  Lock
} from 'lucide-react';

export default function ConnectionsPage() {
  const router = useRouter();
  const [connections, setConnections] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Form State
  const [form, setForm] = useState({
    name: 'Docker SQL Server 2022',
    server_host: 'localhost',
    port: 1433,
    database_name: 'AdventureStore',
    login_username: 'sqlpilot_readonly',
    password: 'ReadOnlyPass2026!',
    is_read_only: true
  });

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; latencyMs?: number; error?: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadConnections = async () => {
    try {
      setLoading(true);
      const data = await api.connections.list();
      setConnections(data);
    } catch (err: any) {
      console.warn('Failed to load connections:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConnections();
  }, []);

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await api.connections.test(form);
      setTestResult(res);
    } catch (err: any) {
      setTestResult({ success: false, error: err.message });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErrorMsg(null);
    try {
      const newConn = await api.connections.create(form);
      localStorage.setItem('sqlpilot_active_conn', newConn.id.toString());
      setIsModalOpen(false);
      await loadConnections();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to save connection');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to remove this connection? Its secret reference will also be wiped.')) return;
    try {
      await api.connections.delete(id);
      await loadConnections();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleSelect = (id: number) => {
    localStorage.setItem('sqlpilot_active_conn', id.toString());
    window.dispatchEvent(new Event('sqlpilot_connection_changed'));
    router.push('/schema');
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center space-x-2.5">
            <Server className="w-6 h-6 text-sky-400" />
            <span>Database Connections</span>
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Connect Microsoft SQL Server instances. Credentials are encrypted and stored via AWS Secrets Manager.
          </p>
        </div>

        <button
          onClick={() => {
            setTestResult(null);
            setErrorMsg(null);
            setIsModalOpen(true);
          }}
          className="inline-flex items-center space-x-2 px-4 py-2 bg-sky-500 hover:bg-sky-400 text-slate-950 rounded-lg text-sm font-semibold transition shadow-md shadow-sky-500/15"
        >
          <Plus className="w-4 h-4" />
          <span>New Connection</span>
        </button>
      </div>

      {/* Connections Grid */}
      {loading ? (
        <div className="flex items-center justify-center p-12 text-slate-400 space-x-2">
          <RefreshCw className="w-5 h-5 animate-spin" />
          <span>Loading database connections...</span>
        </div>
      ) : connections.length === 0 ? (
        <div className="text-center py-16 px-4 border border-dashed border-slate-800 rounded-xl bg-slate-900/30">
          <Server className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <h2 className="text-base font-medium text-slate-300">No database connections configured</h2>
          <p className="text-sm text-slate-500 max-w-sm mx-auto mt-1">
            Add a connection to your local SQL Server container (mcr.microsoft.com/mssql/server:2022) or remote RDS database.
          </p>
          <button
            onClick={() => setIsModalOpen(true)}
            className="mt-4 px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-semibold"
          >
            Connect SQL Server
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {connections.map(conn => (
            <div
              key={conn.id}
              className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 hover:border-slate-700 transition flex flex-col justify-between space-y-4 shadow-sm"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-2">
                    <div className="w-8 h-8 rounded-lg bg-sky-500/10 text-sky-400 flex items-center justify-center">
                      <Server className="w-4 h-4" />
                    </div>
                    <div>
                      <h2 className="text-base font-semibold text-white">{conn.name}</h2>
                      <span className="text-xs text-slate-400">{conn.database_name}</span>
                    </div>
                  </div>
                  <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                    <ShieldCheck className="w-3 h-3" />
                    <span>Read-Only</span>
                  </span>
                </div>

                <div className="space-y-1.5 text-xs text-slate-300 bg-slate-950/60 p-3 rounded-lg border border-slate-800/80 font-mono">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Host:</span>
                    <span>{conn.server_host}:{conn.port}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Login:</span>
                    <span>{conn.login_username}</span>
                  </div>
                  <div className="flex justify-between items-center pt-1 border-t border-slate-800/60">
                    <span className="text-slate-500 flex items-center space-x-1">
                      <Lock className="w-3 h-3 text-indigo-400" />
                      <span>Secret:</span>
                    </span>
                    <span className="text-indigo-400 truncate max-w-[140px]" title={conn.secret_ref}>
                      {conn.secret_ref ? 'Ref Stored ✓' : 'Local'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between">
                <button
                  onClick={() => handleSelect(conn.id)}
                  className="inline-flex items-center space-x-1.5 text-xs font-semibold text-sky-400 hover:text-sky-300 transition"
                >
                  <Network className="w-3.5 h-3.5" />
                  <span>Explore Schema</span>
                </button>

                <button
                  onClick={() => handleDelete(conn.id)}
                  className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded transition"
                  title="Remove connection"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal: New Connection */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="text-lg font-bold text-white flex items-center space-x-2">
                <Server className="w-5 h-5 text-sky-400" />
                <span>Add SQL Server Connection</span>
              </h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Connection Label</label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-sky-500"
                  placeholder="e.g. Production Analytics Read-Only"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-300 mb-1">Server Host</label>
                  <input
                    type="text"
                    required
                    value={form.server_host}
                    onChange={e => setForm({ ...form, server_host: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-sky-500"
                    placeholder="localhost or sqlserver"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Port</label>
                  <input
                    type="number"
                    required
                    value={form.port}
                    onChange={e => setForm({ ...form, port: parseInt(e.target.value, 10) || 1433 })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-sky-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Database Name</label>
                <input
                  type="text"
                  required
                  value={form.database_name}
                  onChange={e => setForm({ ...form, database_name: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-sky-500"
                  placeholder="AdventureStore"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Login Username</label>
                  <input
                    type="text"
                    required
                    value={form.login_username}
                    onChange={e => setForm({ ...form, login_username: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-sky-500"
                    placeholder="sqlpilot_readonly"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Password</label>
                  <input
                    type="password"
                    required
                    value={form.password}
                    onChange={e => setForm({ ...form, password: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-sky-500"
                    placeholder="••••••••••••"
                  />
                </div>
              </div>

              {/* Secrets Note */}
              <div className="bg-indigo-950/30 border border-indigo-800/40 rounded-lg p-2.5 text-xs text-indigo-300 flex items-start space-x-2">
                <Lock className="w-4 h-4 text-indigo-400 mt-0.5 shrink-0" />
                <span>
                  <strong>Zero Plaintext Storage:</strong> Password is saved directly to AWS Secrets Manager (or local encrypted vault). The database only stores an ARN reference.
                </span>
              </div>

              {/* Test Connection Feedback */}
              {testResult && (
                <div
                  className={`p-3 rounded-lg text-xs flex items-center space-x-2 ${
                    testResult.success
                      ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'
                      : 'bg-rose-500/10 border border-rose-500/30 text-rose-300'
                  }`}
                >
                  {testResult.success ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>Connection verified successfully in {testResult.latencyMs}ms.</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                      <span>{testResult.error || 'Connection failed'}</span>
                    </>
                  )}
                </div>
              )}

              {errorMsg && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs rounded-lg">
                  {errorMsg}
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center justify-between pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={handleTest}
                  disabled={testing}
                  className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition flex items-center space-x-1.5"
                >
                  {testing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Key className="w-3.5 h-3.5" />}
                  <span>{testing ? 'Testing...' : 'Test Connection'}</span>
                </button>

                <div className="flex space-x-2">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2 rounded-lg text-slate-400 hover:text-white text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-4 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-semibold transition"
                  >
                    {saving ? 'Saving...' : 'Save Connection'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
