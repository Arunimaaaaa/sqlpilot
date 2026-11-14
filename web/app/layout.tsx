import './globals.css';
import '@xyflow/react/dist/style.css';
import { AuthProvider } from '../lib/auth-context';
import Navbar from '../components/Navbar';

export const metadata = {
  title: 'SQLPilot — Database Copilot for MS SQL Server',
  description: 'Schema Introspection, Read-Only Guardrails, Natural Language to T-SQL, and DMV Performance Analytics'
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-sky-500/30 selection:text-sky-200">
        <AuthProvider>
          <Navbar />
          <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6">
            {children}
          </main>
        </AuthProvider>
      </body>
    </html>
  );
}
