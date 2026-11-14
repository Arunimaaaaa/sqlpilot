'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '../lib/auth-context';
import { api } from '../lib/api';
import {
  Database,
  Network,
  Terminal,
  Activity,
  History,
  ShieldCheck,
  Server,
  LogOut
} from 'lucide-react';

export default function Navbar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [connections, setConnections] = useState<any[]>([]);
  const [selectedConnId, setSelectedConnId] = useState<number>(1);

  useEffect(() => {
    async function loadConns() {
      try {
        const list = await api.connections.list();
        setConnections(list);
        if (list.length > 0) {
          const saved = localStorage.getItem('sqlpilot_active_conn');
          if (saved) {
            setSelectedConnId(parseInt(saved, 10));
          } else {
            setSelectedConnId(list[0].id);
            localStorage.setItem('sqlpilot_active_conn', list[0].id.toString());
          }
        }
      } catch (e) {
        console.warn('Failed to load connections in navbar', e);
      }
    }
    loadConns();
  }, [pathname]);

  const handleSelectConn = (id: number) => {
    setSelectedConnId(id);
    localStorage.setItem('sqlpilot_active_conn', id.toString());
    window.dispatchEvent(new Event('sqlpilot_connection_changed'));
  };

  const navLinks = [
    { href: '/connections', label: 'Connections', icon: Server },
    { href: '/schema', label: 'Schema ERD', icon: Network },
    { href: '/console', label: 'Query & Copilot', icon: Terminal },
    { href: '/performance', label: 'Performance (DMV)', icon: Activity },
    { href: '/history', label: 'History & Snippets', icon: History }
  ];

  return (
    <header className="bg-slate-900 border-b border-slate-800 text-slate-100 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center space-x-6">
          <Link href="/" className="flex items-center space-x-2.5 font-bold text-xl tracking-tight text-white hover:opacity-90 transition">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-tr from-sky-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-sky-500/20">
              <Database className="w-5 h-5 text-white" />
            </div>
            <span>SQLPilot</span>
          </Link>

          {/* Nav Links */}
          <nav className="hidden md:flex items-center space-x-1">
            {navLinks.map(link => {
              const Icon = link.icon;
              const isActive = pathname.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition ${
                    isActive
                      ? 'bg-sky-500/15 text-sky-400 border border-sky-500/30'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{link.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Right side: Active DB selector, Read-Only Badge, Auth */}
        <div className="flex items-center space-x-4">
          {/* Active Connection Selector */}
          <div className="hidden sm:flex items-center space-x-2 bg-slate-800/80 border border-slate-700/80 px-2.5 py-1 rounded-lg text-xs">
            <Server className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={selectedConnId}
              onChange={e => handleSelectConn(parseInt(e.target.value, 10))}
              aria-label="Active database connection"
              className="bg-transparent text-slate-200 outline-none cursor-pointer pr-1"
            >
              {connections.length > 0 ? (
                connections.map(c => (
                  <option key={c.id} value={c.id} className="bg-slate-900 text-slate-200">
                    {c.name} ({c.database_name})
                  </option>
                ))
              ) : (
                <option value={1} className="bg-slate-900 text-slate-200">
                  AdventureStore (Docker)
                </option>
              )}
            </select>
          </div>

          {/* Read-Only Enforced Badge */}
          <div className="flex items-center space-x-1.5 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 px-2.5 py-1 rounded-full text-xs font-medium">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Read-Only Guardrail</span>
          </div>

          {/* User info */}
          {user && (
            <div className="flex items-center space-x-3 text-xs text-slate-400 pl-2 border-l border-slate-800">
              <span className="hidden lg:inline">{user.email}</span>
              <button
                onClick={logout}
                title="Sign out"
                className="p-1 hover:text-white transition rounded"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
