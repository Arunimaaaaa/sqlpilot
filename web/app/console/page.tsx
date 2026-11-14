'use client';

import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { api } from '../../lib/api';
import ResultsGrid from '../../components/ResultsGrid';
import {
  Play,
  Sparkles,
  ShieldCheck,
  Bookmark,
  RefreshCw,
  AlertCircle,
  HelpCircle,
  CheckCircle2,
  Clock,
  Database
} from 'lucide-react';

// Dynamic import for Monaco Editor to avoid SSR window issues
const Editor = dynamic(() => import('@monaco-editor/react'), { ssr: false });

export default function ConsolePage() {
  const [sql, setSql] = useState<string>(
    `-- SQLPilot Read-Only Console (MS SQL Server 2022)
SELECT TOP 10 
    c.customer_id, 
    c.first_name + ' ' + c.last_name AS customer_name,
    c.email,
    COUNT(o.order_id) AS total_orders,
    ISNULL(SUM(o.total_amount), 0) AS total_spent
FROM customers c
LEFT JOIN orders o ON c.customer_id = o.customer_id
GROUP BY c.customer_id, c.first_name, c.last_name, c.email
ORDER BY total_spent DESC;`
  );

  const [nlPrompt, setNlPrompt] = useState('');
  const [askingLlm, setAskingLlm] = useState(false);
  const [llmExplanation, setLlmExplanation] = useState<string | null>(null);

  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const [savingSnippet, setSavingSnippet] = useState(false);
  const [snippetTitle, setSnippetTitle] = useState('');
  const [snippetSavedAlert, setSnippetSavedAlert] = useState(false);

  const getActiveConnId = () => {
    return localStorage.getItem('sqlpilot_active_conn')
      ? parseInt(localStorage.getItem('sqlpilot_active_conn')!, 10)
      : 1;
  };

  const handleRunQuery = async () => {
    setError(null);
    setRunning(true);
    try {
      const connId = getActiveConnId();
      const res = await api.query.run(connId, sql);
      setResults(res);
    } catch (err: any) {
      setError(err.message || 'Execution failed');
      setResults(null);
    } finally {
      setRunning(false);
    }
  };

  const handleAskLlm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nlPrompt.trim()) return;

    setAskingLlm(true);
    setError(null);
    setLlmExplanation(null);

    try {
      const connId = getActiveConnId();
      const res = await api.query.ask(connId, nlPrompt);

      if (!res.is_valid) {
        setError(res.error || 'Generated query was blocked by read-only validator');
        return;
      }

      setSql(res.sql);
      setLlmExplanation(res.explanation);
    } catch (err: any) {
      setError(err.message || 'Failed to generate query');
    } finally {
      setAskingLlm(false);
    }
  };

  const handleSaveSnippet = async () => {
    if (!snippetTitle.trim()) {
      alert('Please enter a snippet title');
      return;
    }

    try {
      const connId = getActiveConnId();
      await api.snippets.save({
        connection_id: connId,
        title: snippetTitle,
        sql_text: sql,
        notes: llmExplanation || 'Saved from console'
      });
      setSnippetSavedAlert(true);
      setSavingSnippet(false);
      setSnippetTitle('');
      setTimeout(() => setSnippetSavedAlert(false), 3000);
    } catch (err: any) {
      alert(err.message || 'Failed to save snippet');
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Banner: Read-Only Guardrail Status */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900 border border-slate-800 p-3 rounded-xl">
        <div className="flex items-center space-x-2 text-xs">
          <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <span className="text-slate-300">
            <strong>Read-Only Guardrail Active:</strong> Mutating statements (INSERT, UPDATE, DELETE, DROP, ALTER, TRUNCATE, EXEC, SELECT INTO) are strictly blocked.
          </span>
        </div>

        <div className="text-[11px] text-slate-500 flex items-center space-x-2">
          <Clock className="w-3.5 h-3.5 text-slate-400" />
          <span>Timeout: 15s | Cap: 500 rows</span>
        </div>
      </div>

      {/* NL Copilot Query Generator */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 space-y-3 shadow-lg">
        <form onSubmit={handleAskLlm} className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Sparkles className="w-4 h-4 text-sky-400 absolute left-3 top-3" />
            <input
              type="text"
              value={nlPrompt}
              onChange={e => setNlPrompt(e.target.value)}
              placeholder="Ask SQLPilot in English (e.g. 'Show active products with price above $100 and low stock')"
              className="w-full bg-slate-950 border border-slate-700/80 rounded-lg pl-9 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 transition"
            />
          </div>

          <button
            type="submit"
            disabled={askingLlm || !nlPrompt.trim()}
            className="px-4 py-2 bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center justify-center space-x-1.5 transition shadow-md shadow-sky-500/10 shrink-0"
          >
            {askingLlm ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Grounding on Schema...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5" />
                <span>Generate T-SQL</span>
              </>
            )}
          </button>
        </form>

        {/* LLM Explanation Card */}
        {llmExplanation && (
          <div className="bg-sky-950/30 border border-sky-800/40 rounded-lg p-3 text-xs text-sky-200 flex items-start space-x-2.5 animate-in fade-in duration-150">
            <CheckCircle2 className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-sky-300">AI Explanation: </span>
              <span>{llmExplanation}</span>
            </div>
          </div>
        )}
      </div>

      {/* Monaco Editor Container */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
        <div className="px-4 py-2 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between text-xs">
          <div className="flex items-center space-x-2 text-slate-400">
            <Database className="w-3.5 h-3.5 text-sky-400" />
            <span className="font-semibold text-slate-300">T-SQL Query Console</span>
            <span className="text-slate-600">|</span>
            <span className="text-[11px] text-slate-500">Press Ctrl+Enter to execute</span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => setSavingSnippet(true)}
              className="flex items-center space-x-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition"
              title="Save as snippet"
            >
              <Bookmark className="w-3.5 h-3.5" />
              <span>Save Snippet</span>
            </button>

            <button
              onClick={handleRunQuery}
              disabled={running}
              className="flex items-center space-x-1.5 px-3 py-1 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold rounded text-xs transition shadow-md shadow-emerald-500/20"
            >
              {running ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Validating & Running...</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Run Query</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Editor */}
        <div className="h-56">
          <Editor
            height="100%"
            defaultLanguage="sql"
            theme="vs-dark"
            value={sql}
            onChange={(val) => setSql(val || '')}
            options={{
              minimap: { enabled: false },
              fontSize: 13,
              scrollBeyondLastLine: false,
              wordWrap: 'on',
              lineNumbersMinChars: 3
            }}
          />
        </div>
      </div>

      {/* Snippet Saved Notification */}
      {snippetSavedAlert && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs rounded-xl flex items-center space-x-2 animate-in fade-in duration-150">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>Snippet saved successfully! Accessible in History & Snippets.</span>
        </div>
      )}

      {/* Error Alert */}
      {error && (
        <div className="p-3.5 bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs rounded-xl flex items-start space-x-2.5 animate-in fade-in duration-150">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold text-rose-200">Execution / Validation Error:</span>
            <p className="mt-0.5 font-mono">{error}</p>
          </div>
        </div>
      )}

      {/* Results Grid */}
      {results && (
        <ResultsGrid
          columns={results.columns || []}
          rows={results.rows || []}
          rowCount={results.row_count || 0}
          durationMs={results.duration_ms || 0}
          truncated={results.truncated || false}
        />
      )}

      {/* Save Snippet Modal */}
      {savingSnippet && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full p-5 space-y-4 shadow-2xl">
            <h2 className="text-base font-bold text-white flex items-center space-x-2">
              <Bookmark className="w-4 h-4 text-sky-400" />
              <span>Save Query Snippet</span>
            </h2>
            <div>
              <label className="block text-xs text-slate-300 mb-1">Snippet Title</label>
              <input
                type="text"
                value={snippetTitle}
                onChange={e => setSnippetTitle(e.target.value)}
                placeholder="e.g. Top Customers Spend Summary"
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-500"
              />
            </div>
            <div className="flex justify-end space-x-2 pt-2">
              <button
                onClick={() => setSavingSnippet(false)}
                className="px-3 py-1.5 rounded-lg text-slate-400 hover:text-white text-xs"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveSnippet}
                className="px-4 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-semibold"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
