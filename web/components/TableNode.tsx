'use client';

import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { Key, Link as LinkIcon, Table, Eye } from 'lucide-react';

export default function TableNode({ data }: { data: any }) {
  const { table_name, table_type, columns, primary_key = [] } = data;
  const isView = table_type === 'VIEW';

  return (
    <div className="bg-slate-900/95 border-2 border-slate-700/80 hover:border-sky-500 rounded-xl shadow-2xl overflow-hidden min-w-[260px] text-xs font-mono transition-colors">
      {/* Target Handle for incoming Foreign Keys */}
      <Handle
        type="target"
        position={Position.Left}
        className="!w-3 !h-3 !bg-sky-400 !border-2 !border-slate-900"
      />

      {/* Table Header */}
      <div className={`px-3 py-2.5 flex items-center justify-between border-b ${
        isView ? 'bg-indigo-950/60 border-indigo-800/60 text-indigo-200' : 'bg-slate-800/90 border-slate-700 text-white'
      }`}>
        <div className="flex items-center space-x-2">
          {isView ? <Eye className="w-3.5 h-3.5 text-indigo-400" /> : <Table className="w-3.5 h-3.5 text-sky-400" />}
          <span className="font-bold font-sans text-sm tracking-tight text-slate-100">{table_name}</span>
        </div>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-950/60 text-slate-400 uppercase font-sans">
          {isView ? 'View' : 'Table'}
        </span>
      </div>

      {/* Columns List */}
      <div className="p-2 space-y-1 max-h-64 overflow-y-auto divide-y divide-slate-800/40">
        {columns && columns.map((col: any) => {
          const isPk = col.is_primary_key || primary_key.includes(col.column_name);
          const isFk = col.is_foreign_key;

          return (
            <div
              key={col.column_name}
              className="flex items-center justify-between py-1 px-1 hover:bg-slate-800/40 rounded transition"
            >
              <div className="flex items-center space-x-1.5 truncate pr-2">
                {isPk ? (
                  <span title="Primary Key">
                    <Key className="w-3 h-3 text-amber-400 shrink-0" />
                  </span>
                ) : isFk ? (
                  <span title="Foreign Key">
                    <LinkIcon className="w-3 h-3 text-sky-400 shrink-0" />
                  </span>
                ) : (
                  <span className="w-3 h-3 block shrink-0" />
                )}
                <span className={`truncate ${isPk ? 'text-amber-200 font-semibold' : 'text-slate-200'}`}>
                  {col.column_name}
                </span>
              </div>

              <div className="text-[11px] text-slate-500 shrink-0">
                <span>{col.data_type}</span>
                {col.character_maximum_length && (
                  <span>({col.character_maximum_length === -1 ? 'max' : col.character_maximum_length})</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Source Handle for outgoing Foreign Keys */}
      <Handle
        type="source"
        position={Position.Right}
        className="!w-3 !h-3 !bg-sky-400 !border-2 !border-slate-900"
      />
    </div>
  );
}
