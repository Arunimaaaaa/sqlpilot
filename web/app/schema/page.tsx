'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  Node,
  Edge,
  MarkerType
} from '@xyflow/react';
import TableNode from '../../components/TableNode';
import { api } from '../../lib/api';
import {
  Network,
  RefreshCw,
  Search,
  Key,
  Layers,
  Database,
  Info
} from 'lucide-react';

const nodeTypes = {
  tableNode: TableNode
};

export default function SchemaErdPage() {
  const [schema, setSchema] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTable, setSelectedTable] = useState<any>(null);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  const loadSchema = useCallback(async (forceRefresh = false) => {
    try {
      if (forceRefresh) setRefreshing(true);
      else setLoading(true);

      const connId = localStorage.getItem('sqlpilot_active_conn')
        ? parseInt(localStorage.getItem('sqlpilot_active_conn')!, 10)
        : 1;

      const data = await api.introspection.introspect(connId, forceRefresh);
      setSchema(data);

      // Layout tables in a readable grid
      const initialNodes: Node[] = [];
      const colsPerRow = 3;
      const xSpacing = 360;
      const ySpacing = 340;

      data.tables.forEach((table: any, index: number) => {
        const row = Math.floor(index / colsPerRow);
        const col = index % colsPerRow;

        initialNodes.push({
          id: table.table_name,
          type: 'tableNode',
          position: { x: 50 + col * xSpacing, y: 50 + row * ySpacing },
          data: table
        });
      });

      // Build foreign key edges
      const initialEdges: Edge[] = [];
      data.foreign_keys.forEach((fk: any, i: number) => {
        initialEdges.push({
          id: `fk-${fk.from_table}-${fk.to_table}-${i}`,
          source: fk.from_table,
          target: fk.to_table,
          animated: true,
          label: `${fk.from_column} → ${fk.to_column}`,
          labelStyle: { fill: '#94a3b8', fontSize: 10, fontFamily: 'monospace' },
          labelBgStyle: { fill: '#0f172a', fillOpacity: 0.8 },
          labelBgPadding: [4, 2],
          labelBgBorderRadius: 4,
          style: { stroke: '#38bdf8', strokeWidth: 2 },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: '#38bdf8',
            width: 15,
            height: 15
          }
        });
      });

      setNodes(initialNodes);
      setEdges(initialEdges);
    } catch (err: any) {
      console.warn('Failed to load schema ERD:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [setNodes, setEdges]);

  useEffect(() => {
    loadSchema();
    const handleConnChange = () => loadSchema();
    window.addEventListener('sqlpilot_connection_changed', handleConnChange);
    return () => window.removeEventListener('sqlpilot_connection_changed', handleConnChange);
  }, [loadSchema]);

  const onNodeClick = (_: any, node: Node) => {
    setSelectedTable(node.data);
  };

  const filteredNodes = useMemo(() => {
    if (!searchQuery.trim()) return nodes;
    return nodes.map(node => ({
      ...node,
      hidden: !node.id.toLowerCase().includes(searchQuery.toLowerCase())
    }));
  }, [nodes, searchQuery]);

  return (
    <div className="h-[calc(100vh-120px)] flex flex-col space-y-4">
      {/* Top Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900 border border-slate-800 p-3.5 rounded-xl">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-sky-500/10 text-sky-400 rounded-lg">
            <Network className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-bold text-white flex items-center space-x-2">
              <span>Interactive Schema ERD</span>
              <span className="text-xs font-normal text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full">
                {schema?.database_name || 'AdventureStore'}
              </span>
            </h1>
            <p className="text-xs text-slate-400">
              Live schema introspected from SQL Server metadata & foreign keys.
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          {/* Search Table */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5" />
            <input
              type="text"
              placeholder="Filter tables..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="bg-slate-950 border border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 w-44"
            />
          </div>

          {/* Refresh Schema Button */}
          <button
            onClick={() => loadSchema(true)}
            disabled={refreshing}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-medium transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-sky-400' : ''}`} />
            <span>{refreshing ? 'Introspecting...' : 'Re-introspect'}</span>
          </button>
        </div>
      </div>

      {/* Main Diagram Canvas */}
      <div className="flex-1 bg-slate-950 border border-slate-800 rounded-xl overflow-hidden relative shadow-inner">
        {loading ? (
          <div className="h-full flex items-center justify-center text-slate-400 space-x-2">
            <RefreshCw className="w-6 h-6 animate-spin text-sky-400" />
            <span className="text-sm">Querying SQL Server INFORMATION_SCHEMA & foreign keys...</span>
          </div>
        ) : (
          <ReactFlow
            nodes={filteredNodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={onNodeClick}
            nodeTypes={nodeTypes}
            fitView
            minZoom={0.2}
            maxZoom={1.5}
          >
            <Background color="#1e293b" gap={24} size={1.5} />
            <Controls className="!bg-slate-900 !border-slate-700 !fill-slate-300" />
            <MiniMap
              nodeColor="#0284c7"
              maskColor="rgba(15, 23, 42, 0.7)"
              className="!bg-slate-900 !border-slate-800"
            />
          </ReactFlow>
        )}

        {/* Selected Table Inspector Sidebar */}
        {selectedTable && (
          <div className="absolute right-4 top-4 bottom-4 w-80 bg-slate-900/95 border border-slate-700 rounded-xl p-4 shadow-2xl overflow-y-auto space-y-4 backdrop-blur-md animate-in slide-in-from-right-4 duration-150 text-xs">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
              <div>
                <span className="text-[10px] text-sky-400 font-mono uppercase tracking-wider">Table Details</span>
                <h2 className="text-sm font-bold text-white">{selectedTable.table_name}</h2>
              </div>
              <button
                onClick={() => setSelectedTable(null)}
                className="text-slate-400 hover:text-white p-1"
              >
                ✕
              </button>
            </div>

            {/* Columns Summary */}
            <div className="space-y-1.5">
              <span className="text-slate-400 font-medium">Columns ({selectedTable.columns?.length})</span>
              <div className="bg-slate-950 p-2 rounded-lg border border-slate-800 space-y-1 font-mono">
                {selectedTable.columns?.map((c: any) => (
                  <div key={c.column_name} className="flex justify-between items-center py-0.5">
                    <span className="text-slate-200 truncate pr-2">{c.column_name}</span>
                    <span className="text-slate-500">{c.data_type}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Foreign Keys */}
            {selectedTable.foreign_keys && selectedTable.foreign_keys.length > 0 && (
              <div className="space-y-1.5">
                <span className="text-slate-400 font-medium">Outgoing Foreign Keys</span>
                <div className="space-y-1">
                  {selectedTable.foreign_keys.map((fk: any, i: number) => (
                    <div key={i} className="bg-slate-950 p-2 rounded-lg border border-slate-800 text-[11px] font-mono text-slate-300">
                      <div className="text-sky-400">{fk.from_column}</div>
                      <div className="text-slate-500">↓ references</div>
                      <div className="text-emerald-400">{fk.to_table}.{fk.to_column}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Indexes */}
            {selectedTable.indexes && selectedTable.indexes.length > 0 && (
              <div className="space-y-1.5">
                <span className="text-slate-400 font-medium">Indexes</span>
                <div className="space-y-1">
                  {selectedTable.indexes.map((idx: any, i: number) => (
                    <div key={i} className="bg-slate-950 p-2 rounded-lg border border-slate-800 text-[11px] font-mono text-slate-300 flex justify-between">
                      <span className="truncate pr-2">{idx.index_name}</span>
                      <span className="text-slate-500">{idx.is_unique ? 'Unique' : 'Non-unique'}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
