'use client';

import React, { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import {
  Activity,
  Zap,
  Clock,
  Copy,
  Check,
  RefreshCw,
  Sparkles,
  TrendingUp,
  Cpu,
  Layers,
  HelpCircle
} from 'lucide-react';

export default function PerformancePage() {
  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const loadReport = async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      const connId = localStorage.getItem('sqlpilot_active_conn')
        ? parseInt(localStorage.getItem('sqlpilot_active_conn')!, 10)
        : 1;

      const data = await api.performance.getReport(connId);
      setReport(data);
    } catch (err) {
      console.warn('Failed to load DMV performance report:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadReport();
    const handleConnChange = () => loadReport();
    window.addEventListener('sqlpilot_connection_changed', handleConnChange);
    return () => window.removeEventListener('sqlpilot_connection_changed', handleConnChange);
  }, []);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center space-x-2.5">
            <Activity className="w-6 h-6 text-emerald-400" />
            <span>SQL Server DMV Performance Diagnostics</span>
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Engine statistics from <code>sys.dm_db_missing_index_*</code> and <code>sys.dm_exec_query_stats</code> with AI rationales.
          </p>
        </div>

        <button
          onClick={() => loadReport(true)}
          disabled={refreshing}
          className="inline-flex items-center space-x-2 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-semibold transition"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-emerald-400' : ''}`} />
          <span>{refreshing ? 'Analyzing DMVs...' : 'Refresh DMVs'}</span>
        </button>
      </div>

      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center text-slate-400 space-y-3">
          <RefreshCw className="w-6 h-6 animate-spin text-emerald-400" />
          <span className="text-sm">Reading SQL Server dynamic management views...</span>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Missing Indexes Section */}
          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <Zap className="w-5 h-5 text-amber-400" />
              <h2 className="text-lg font-bold text-white">Missing Index Recommendations</h2>
              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/20 font-medium">
                {report?.missing_indexes?.length || 0} Detected
              </span>
            </div>

            <div className="grid grid-cols-1 gap-4">
              {report?.missing_indexes?.map((idx: any, i: number) => (
                <div
                  key={i}
                  className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 space-y-3 hover:border-slate-700 transition shadow-sm"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-mono px-2 py-1 bg-slate-950 text-sky-400 rounded border border-slate-800">
                        [{idx.table_name}]
                      </span>
                      <span className="text-xs text-slate-400">
                        Est. Seeks: <strong>{idx.user_seeks}</strong>
                      </span>
                    </div>

                    <div className="flex items-center space-x-2 text-xs">
                      <span className="text-slate-400">Improvement Impact:</span>
                      <span className="font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                        +{idx.avg_user_impact}%
                      </span>
                    </div>
                  </div>

                  {/* Suggested SQL */}
                  <div className="relative group bg-slate-950 border border-slate-800 rounded-lg p-3 font-mono text-xs text-slate-200">
                    <pre className="overflow-x-auto whitespace-pre-wrap">{idx.suggested_index}</pre>
                    <button
                      onClick={() => handleCopy(idx.suggested_index, `idx-${i}`)}
                      className="absolute right-2 top-2 p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 transition"
                      title="Copy T-SQL"
                    >
                      {copiedId === `idx-${i}` ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>

                  {/* AI Rationale */}
                  <div className="bg-sky-950/20 border border-sky-800/30 rounded-lg p-3 text-xs text-sky-200 flex items-start space-x-2.5">
                    <Sparkles className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold text-sky-300">DBA Rationale: </span>
                      <span>
                        {idx.rationale ||
                          `Adding this covering index eliminates full table scans on [${idx.table_name}], converting user lookups into high-speed seeks with an estimated improvement of ~${idx.avg_user_impact}%.`}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Top Slow Queries Section */}
          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <Clock className="w-5 h-5 text-rose-400" />
              <h2 className="text-lg font-bold text-white">Top Slow Queries (DMV Execution Stats)</h2>
              <span className="text-xs px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-300 border border-rose-500/20 font-medium">
                {report?.slow_queries?.length || 0} Monitored
              </span>
            </div>

            <div className="grid grid-cols-1 gap-4">
              {report?.slow_queries?.map((query: any, i: number) => (
                <div
                  key={i}
                  className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 space-y-3 hover:border-slate-700 transition shadow-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3 text-xs font-mono text-slate-400 border-b border-slate-800 pb-2.5">
                    <div>Executions: <strong className="text-slate-200">{query.execution_count}</strong></div>
                    <div>Avg Elapsed: <strong className="text-rose-400">{query.avg_elapsed_time_ms}ms</strong></div>
                    <div>Avg CPU Worker: <strong className="text-amber-400">{query.avg_worker_time_ms}ms</strong></div>
                    <div>Avg Logical Reads: <strong className="text-indigo-400">{query.avg_logical_reads}</strong></div>
                  </div>

                  <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 font-mono text-xs text-slate-300 overflow-x-auto">
                    <code>{query.sql_text}</code>
                  </div>

                  <div className="bg-rose-950/20 border border-rose-800/30 rounded-lg p-3 text-xs text-rose-200 flex items-start space-x-2.5">
                    <Sparkles className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold text-rose-300">Diagnostic Insight: </span>
                      <span>
                        {query.rationale ||
                          `Query generates high logical I/O reads (${query.total_logical_reads} total). Consider adding an index covering join and filter predicates to reduce table scans.`}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
