'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '../lib/api';
import {
  Database,
  Network,
  Terminal,
  Activity,
  ShieldCheck,
  Server,
  Lock,
  ArrowRight,
  Cpu,
  Layers,
  Sparkles
} from 'lucide-react';

export default function DashboardPage() {
  const [connections, setConnections] = useState<any[]>([]);
  const [schema, setSchema] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const conns = await api.connections.list();
        setConnections(conns);

        const activeConnId = localStorage.getItem('sqlpilot_active_conn')
          ? parseInt(localStorage.getItem('sqlpilot_active_conn')!, 10)
          : conns[0]?.id || 1;

        const s = await api.introspection.introspect(activeConnId);
        setSchema(s);
      } catch (err) {
        console.warn('Dashboard loadData warning:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const tableCount = schema?.tables?.length || 6;
  const fkCount = schema?.foreign_keys?.length || 6;

  return (
    <div className="space-y-8 py-2">
      {/* Hero Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-slate-900 to-sky-950/40 border border-slate-800 p-8 shadow-2xl">
        <div className="relative z-10 max-w-3xl space-y-4">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-sky-500/10 border border-sky-500/30 text-sky-400 text-xs font-semibold tracking-wide uppercase">
            <Sparkles className="w-3.5 h-3.5" />
            <span>AI Database Copilot for MS SQL Server</span>
          </div>

          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
            Explore schemas, ask in plain English, run safe read-only queries.
          </h1>

          <p className="text-slate-300 text-base leading-relaxed">
            SQLPilot connects directly to Microsoft SQL Server 2022 containers and live instances. Introspect foreign-key ERDs, translate natural language questions into validated read-only T-SQL, and diagnose missing indexes from dynamic management views (DMVs).
          </p>

          <div className="pt-2 flex flex-wrap gap-3">
            <Link
              href="/schema"
              className="inline-flex items-center space-x-2 px-5 py-2.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-sm transition shadow-lg shadow-sky-500/20"
            >
              <Network className="w-4 h-4" />
              <span>Explore Schema ERD</span>
              <ArrowRight className="w-4 h-4" />
            </Link>

            <Link
              href="/console"
              className="inline-flex items-center space-x-2 px-5 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-medium text-sm transition"
            >
              <Terminal className="w-4 h-4" />
              <span>Open Query Console</span>
            </Link>
          </div>
        </div>

        {/* Decorative Grid */}
        <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-sky-500/10 via-transparent to-transparent pointer-events-none" />
      </div>

      {/* Safety & Guardrails Strip */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-4 flex items-start space-x-3.5">
          <div className="p-2.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 mt-0.5">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white">Strict Read-Only Enforcement</h2>
            <p className="text-xs text-slate-400 mt-1 leading-normal">
              Two-layer protection: connected DB user has only <code>db_datareader</code>, and an app-side AST validator rejects mutations (INSERT, UPDATE, DELETE, DROP, ALTER, TRUNCATE, EXEC, SELECT INTO).
            </p>
          </div>
        </div>

        <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-4 flex items-start space-x-3.5">
          <div className="p-2.5 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 mt-0.5">
            <Lock className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white">Encrypted Secret References</h2>
            <p className="text-xs text-slate-400 mt-1 leading-normal">
              Connection credentials are saved directly to AWS Secrets Manager (or local encrypted vault). Plaintext passwords are never stored in the database.
            </p>
          </div>
        </div>

        <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-4 flex items-start space-x-3.5">
          <div className="p-2.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 mt-0.5">
            <Cpu className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white">Metadata-Only AI Grounding</h2>
            <p className="text-xs text-slate-400 mt-1 leading-normal">
              Table structures, column data types, and primary/foreign keys are provided to the LLM. <strong>Result rows and table data are never exposed in prompts.</strong>
            </p>
          </div>
        </div>
      </div>

      {/* Feature Tiles */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        <Link
          href="/schema"
          className="group block p-5 rounded-xl bg-slate-900/70 border border-slate-800 hover:border-sky-500/50 hover:bg-slate-900 transition relative overflow-hidden shadow-sm"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="p-2.5 rounded-lg bg-sky-500/10 text-sky-400 group-hover:scale-105 transition">
              <Network className="w-6 h-6" />
            </div>
            <span className="text-xs font-medium px-2 py-0.5 rounded bg-slate-800 text-slate-400">
              {tableCount} Tables
            </span>
          </div>
          <h2 className="text-base font-semibold text-white group-hover:text-sky-400 transition">
            Interactive ER Diagram
          </h2>
          <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
            Visual table nodes with columns, datatypes, PKs, and reactive foreign key relationship edges via React Flow.
          </p>
          <div className="mt-4 flex items-center text-xs font-semibold text-sky-400 space-x-1">
            <span>View diagram</span>
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition" />
          </div>
        </Link>

        <Link
          href="/console"
          className="group block p-5 rounded-xl bg-slate-900/70 border border-slate-800 hover:border-sky-500/50 hover:bg-slate-900 transition relative overflow-hidden shadow-sm"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="p-2.5 rounded-lg bg-violet-500/10 text-violet-400 group-hover:scale-105 transition">
              <Terminal className="w-6 h-6" />
            </div>
            <span className="text-xs font-medium px-2 py-0.5 rounded bg-slate-800 text-slate-400">
              Monaco + NL
            </span>
          </div>
          <h2 className="text-base font-semibold text-white group-hover:text-violet-400 transition">
            NL→SQL & Console
          </h2>
          <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
            Monaco editor with read-only execution, timeout enforcement, row caps, and plain-English natural language query generator.
          </p>
          <div className="mt-4 flex items-center text-xs font-semibold text-violet-400 space-x-1">
            <span>Query data</span>
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition" />
          </div>
        </Link>

        <Link
          href="/performance"
          className="group block p-5 rounded-xl bg-slate-900/70 border border-slate-800 hover:border-emerald-500/50 hover:bg-slate-900 transition relative overflow-hidden shadow-sm"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="p-2.5 rounded-lg bg-emerald-500/10 text-emerald-400 group-hover:scale-105 transition">
              <Activity className="w-6 h-6" />
            </div>
            <span className="text-xs font-medium px-2 py-0.5 rounded bg-slate-800 text-slate-400">
              DMV Analyzer
            </span>
          </div>
          <h2 className="text-base font-semibold text-white group-hover:text-emerald-400 transition">
            Performance Diagnostics
          </h2>
          <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
            Extract missing indexes and slow query statistics from SQL Server DMVs with automated AI rationales.
          </p>
          <div className="mt-4 flex items-center text-xs font-semibold text-emerald-400 space-x-1">
            <span>Analyze engine</span>
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition" />
          </div>
        </Link>

        <Link
          href="/connections"
          className="group block p-5 rounded-xl bg-slate-900/70 border border-slate-800 hover:border-amber-500/50 hover:bg-slate-900 transition relative overflow-hidden shadow-sm"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="p-2.5 rounded-lg bg-amber-500/10 text-amber-400 group-hover:scale-105 transition">
              <Server className="w-6 h-6" />
            </div>
            <span className="text-xs font-medium px-2 py-0.5 rounded bg-slate-800 text-slate-400">
              {connections.length || 1} Connected
            </span>
          </div>
          <h2 className="text-base font-semibold text-white group-hover:text-amber-400 transition">
            Connection Manager
          </h2>
          <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
            Configure SQL Server 2022 containers, remote RDS instances, read-only logins, and Secrets Manager integration.
          </p>
          <div className="mt-4 flex items-center text-xs font-semibold text-amber-400 space-x-1">
            <span>Manage logins</span>
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition" />
          </div>
        </Link>
      </div>
    </div>
  );
}
