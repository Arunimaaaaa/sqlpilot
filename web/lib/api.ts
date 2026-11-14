const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

function getAuthHeader(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  const token = localStorage.getItem('sqlpilot_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const headers = {
    'Content-Type': 'application/json',
    ...getAuthHeader(),
    ...(options.headers || {})
  };

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || `HTTP error ${response.status}: ${response.statusText}`);
  }

  return data as T;
}

export const api = {
  auth: {
    register: (body: { email: string; password: string }) =>
      request<{ user: any; token: string }>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(body)
      }),
    login: (body: { email: string; password: string }) =>
      request<{ user: any; token: string }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(body)
      })
  },

  connections: {
    list: () => request<any[]>('/api/connections'),
    get: (id: number) => request<any>(`/api/connections/${id}`),
    create: (data: any) =>
      request<any>('/api/connections', {
        method: 'POST',
        body: JSON.stringify(data)
      }),
    delete: (id: number) =>
      request<{ success: boolean }>(`/api/connections/${id}`, {
        method: 'DELETE'
      }),
    test: (data: any) =>
      request<{ success: boolean; latencyMs: number; error?: string }>('/api/connections/test', {
        method: 'POST',
        body: JSON.stringify(data)
      })
  },

  introspection: {
    introspect: (connectionId: number, refresh = false) =>
      request<any>(`/api/connections/${connectionId}/introspect?refresh=${refresh}`, {
        method: 'POST'
      })
  },

  query: {
    run: (connectionId: number, sql: string, maxRows = 500) =>
      request<{
        columns: Array<{ name: string; type: string }>;
        rows: any[];
        row_count: number;
        duration_ms: number;
        truncated: boolean;
      }>(`/api/connections/${connectionId}/run`, {
        method: 'POST',
        body: JSON.stringify({ sql, maxRows })
      }),
    ask: (connectionId: number, prompt: string) =>
      request<{
        sql: string;
        explanation: string;
        is_valid: boolean;
        error?: string;
      }>(`/api/connections/${connectionId}/ask`, {
        method: 'POST',
        body: JSON.stringify({ prompt })
      }),
    getHistory: (connectionId: number) =>
      request<any[]>(`/api/connections/${connectionId}/history`)
  },

  performance: {
    getReport: (connectionId: number) =>
      request<{
        connection_id: number;
        analyzed_at: string;
        missing_indexes: any[];
        slow_queries: any[];
      }>(`/api/connections/${connectionId}/performance`)
  },

  snippets: {
    list: (connectionId?: number) =>
      request<any[]>(`/api/snippets${connectionId ? `?connection_id=${connectionId}` : ''}`),
    save: (data: { connection_id: number; title: string; sql_text: string; notes?: string }) =>
      request<any>('/api/snippets', {
        method: 'POST',
        body: JSON.stringify(data)
      })
  }
};
