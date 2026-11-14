'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../../lib/api';
import {
  History,
  Bookmark,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Play,
  Copy,
  Check,
  RefreshCw,
  Terminal,
  Clock
} from 'lucide-react';

export default function HistoryPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'history' | 'snippets'>('history');
  const [history, setHistory] = useState<any[]>([]);
  const [snippets, setSnippets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const getActiveConnId = () => {
    return localStorage.getItem('sqlpilot_active_conn')
      ? parseInt(localStorage.getItem('sqlpilot_active_conn')!, 10)
      : 1;
  };

  const loadData = async () => {
    try {
      setLoading(true);
      const connId = getActiveConnId();
      const [histData, snipData] = await Promise.all([
        api.query.getHistory(connId),
        api.snippets.list(connId)
      ]);
      setHistory(histData);
      setSnippets(snipData);
    } catch (err) {
      console.warn('Failed to load history & snippets:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const handleConnChange = () => loadData();
    window.addEventListener('sqlpilot_connection_changed', handleConnChange);
    return () => window.removeEventListener('sqlpilot_connection_changed', handleConnChange);
  }, []);

  const handleOpenInConsole = (sql: string) => {
    // Open in console by writing to storage or routing
    router.push('/console');
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center space-x-2.5">
            <History className="w-6 h-6 text-sky-400" />
            <span>Query History & Snippet Library</span>
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Persisted query execution history and saved reusable T-SQL snippets.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex bg-slate-900 border border-slate-800 p-1 rounded-xl">
          <button
            onClick={() => setActiveTab('history')}
            className={`flex items-center space-x-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold transition ${
              activeTab === 'history'
                ? 'bg-sky-500 text-slate-950 shadow-md shadow-sky-500/20'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Query History ({history.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('snippets')}
            className={`flex items-center space-x-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold transition ${
              activeTab === 'snippets'
                ? 'bg-sky-500 text-slate-950 shadow-md shadow-sky-500/20'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Bookmark className="w-3.5 h-3.5" />
            <span>Saved Snippets ({snippets.length})</span>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="py-20 flex items-center justify-center text-slate-400 space-x-2">
          <RefreshCw className="w-5 h-5 animate-spin text-sky-400" />
          <span>Loading records...</span>
        </div>
      ) : activeTab === 'history' ? (
        // Query History View
        <div className="space-y-3">
          {history.length === 0 ? (
            <div className="text-center py-16 border border-dashed border-slate-800 rounded-xl bg-slate-900/30 text-slate-500 text-sm">
              No query history yet. Execute queries in the console to track them here.
            </div>
          ) : (
            history.map(item => (
              <div
                key={item.id}
                className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 space-y-3 hover:border-slate-700 transition"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center space-x-2">
                    {item.status === 'SUCCESS' ? (
                      <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-medium">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>SUCCESS</span>
                      </span>
                    ) : item.status === 'REJECTED' ? (
                      <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30 font-medium">
                        <AlertTriangle className="w-3 h-3" />
                        <span>GUARDRAIL REJECTED</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/30 font-medium">
                        <XCircle className="w-3 h-3" />
                        <span>ERROR</span>
                      </span>
                    )}

                    {item.nl_prompt && (
                      <span className="text-slate-300 font-medium truncate max-w-md">
                        &quot;{item.nl_prompt}&quot;
                      </span>
                    )}
                  </div>

                  <div className="flex items-center space-x-3 text-slate-500 font-mono">
                    {item.row_count !== null && <span>{item.row_count} rows</span>}
                    {item.duration_ms !== null && <span>{item.duration_ms}ms</span>}
                    <span>{new Date(item.created_at).toLocaleTimeString()}</span>
                  </div>
                </div>

                {/* SQL display */}
                <div className="relative bg-slate-950 border border-slate-800 rounded-lg p-3 font-mono text-xs text-slate-300 overflow-x-auto">
                  <pre className="whitespace-pre-wrap">{item.generated_sql}</pre>
                  <button
                    onClick={() => handleCopy(item.generated_sql, `hist-${item.id}`)}
                    className="absolute right-2 top-2 p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded border border-slate-700 transition"
                    title="Copy SQL"
                  >
                    {copiedId === `hist-${item.id}` ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>

                {item.error && (
                  <div className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 p-2 rounded-lg font-mono">
                    {item.error}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      ) : (
        // Saved Snippets View
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {snippets.length === 0 ? (
            <div className="col-span-2 text-center py-16 border border-dashed border-slate-800 rounded-xl bg-slate-900/30 text-slate-500 text-sm">
              No saved snippets. In the Query Console, click &quot;Save Snippet&quot; to store your favorite queries.
            </div>
          ) : (
            snippets.map(snip => (
              <div
                key={snip.id}
                className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 space-y-3 hover:border-slate-700 transition flex flex-col justify-between"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-bold text-white">{snip.title}</h2>
                    <span className="text-[11px] text-slate-500 font-mono">
                      {new Date(snip.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  {snip.notes && (
                    <p className="text-xs text-slate-400">{snip.notes}</p>
                  )}
                  <div className="relative bg-slate-950 border border-slate-800 rounded-lg p-3 font-mono text-xs text-slate-300 max-h-36 overflow-y-auto">
                    <pre className="whitespace-pre-wrap">{snip.sql_text}</pre>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
                  <button
                    onClick={() => handleCopy(snip.sql_text, `snip-${snip.id}`)}
                    className="flex items-center space-x-1 text-xs text-slate-400 hover:text-white transition"
                  >
                    {copiedId === `snip-${snip.id}` ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-emerald-400">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>

                  <button
                    onClick={() => handleOpenInConsole(snip.sql_text)}
                    className="flex items-center space-x-1.5 px-3 py-1 bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/30 rounded-lg text-xs font-semibold transition"
                  >
                    <Terminal className="w-3.5 h-3.5" />
                    <span>Run in Console</span>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
