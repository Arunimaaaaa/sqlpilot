'use client';

import React, { useState } from 'react';
import { Download, AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight } from 'lucide-react';

interface ResultsGridProps {
  columns: Array<{ name: string; type: string }>;
  rows: any[];
  rowCount: number;
  durationMs: number;
  truncated: boolean;
}

export default function ResultsGrid({
  columns,
  rows,
  rowCount,
  durationMs,
  truncated
}: ResultsGridProps) {
  const [page, setPage] = useState(0);
  const pageSize = 50;
  const totalPages = Math.ceil(rows.length / pageSize) || 1;
  const pagedRows = rows.slice(page * pageSize, (page + 1) * pageSize);

  const downloadCsv = () => {
    if (!rows.length || !columns.length) return;
    const header = columns.map(c => `"${c.name.replace(/"/g, '""')}"`).join(',');
    const body = rows.map(r =>
      columns.map(c => {
        const val = r[c.name];
        if (val === null || val === undefined) return '""';
        return `"${String(val).replace(/"/g, '""')}"`;
      }).join(',')
    ).join('\n');

    const blob = new Blob([header + '\n' + body], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `query-results-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!rows || rows.length === 0) {
    return (
      <div className="h-64 flex flex-col items-center justify-center text-slate-500 bg-slate-950/60 rounded-xl border border-slate-800 text-sm">
        <span>No results returned. Execute a SELECT query or ask SQLPilot.</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-inner">
      {/* Grid Meta Header */}
      <div className="px-4 py-2.5 bg-slate-900 border-b border-slate-800 flex items-center justify-between text-xs">
        <div className="flex items-center space-x-3">
          <span className="flex items-center space-x-1.5 text-emerald-400 font-medium">
            <CheckCircle2 className="w-4 h-4" />
            <span>Success</span>
          </span>
          <span className="text-slate-400">
            <strong>{rowCount}</strong> {rowCount === 1 ? 'row' : 'rows'} in <strong>{durationMs}ms</strong>
          </span>
          {truncated && (
            <span className="flex items-center space-x-1 text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Row cap reached (truncated for safety)</span>
            </span>
          )}
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={downloadCsv}
            className="flex items-center space-x-1.5 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-md transition font-medium"
          >
            <Download className="w-3.5 h-3.5 text-sky-400" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Table Container */}
      <div className="flex-1 overflow-auto max-h-[380px]">
        <table className="w-full text-left border-collapse text-xs font-mono">
          <thead className="bg-slate-950/90 sticky top-0 z-10 border-b border-slate-800">
            <tr>
              <th className="py-2 px-3 text-slate-500 font-normal w-12 border-r border-slate-800">#</th>
              {columns.map(col => (
                <th key={col.name} className="py-2 px-3 text-slate-300 font-semibold border-r border-slate-800 last:border-r-0 whitespace-nowrap">
                  <span>{col.name}</span>
                  <span className="block text-[10px] text-slate-500 font-normal">{col.type}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {pagedRows.map((row, idx) => (
              <tr key={idx} className="hover:bg-slate-800/40 transition">
                <td className="py-1.5 px-3 text-slate-600 border-r border-slate-800 text-[11px]">
                  {page * pageSize + idx + 1}
                </td>
                {columns.map(col => {
                  const val = row[col.name];
                  const isNull = val === null || val === undefined;
                  return (
                    <td
                      key={col.name}
                      className="py-1.5 px-3 text-slate-300 border-r border-slate-800/60 last:border-r-0 whitespace-nowrap max-w-xs truncate"
                      title={String(val)}
                    >
                      {isNull ? <span className="text-slate-600 italic">NULL</span> : String(val)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      {totalPages > 1 && (
        <div className="px-4 py-2 bg-slate-950/80 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <span>
            Page {page + 1} of {totalPages} ({rows.length} total rows)
          </span>
          <div className="flex items-center space-x-1">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="p-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 transition"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="p-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 transition"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
