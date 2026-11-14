# SQLPilot — Database Copilot for MS SQL Server

A production-grade developer tool that connects to Microsoft SQL Server databases, introspects schemas into interactive ER diagrams, turns plain-English questions into validated **read-only T-SQL**, explains and executes them safely, and inspects SQL Server's own Dynamic Management Views (DMVs) to recommend missing indexes and diagnose slow queries.

---

## 1. Safety Guardrails & Architecture

SQLPilot enforces database security and read-only access **by construction**:

1. **Two-Layer Read-Only Enforcement:**
   - **Database Role:** Connected DB accounts use a dedicated read-only SQL Server login (`sqlpilot_readonly`) belonging strictly to the `db_datareader` role.
   - **Application-Side AST & Lexical Validator:** Rejects any query that is not a single `SELECT` or `WITH ... SELECT` statement. Blocks all mutations (`INSERT`, `UPDATE`, `DELETE`, `DROP`, `ALTER`, `TRUNCATE`, `MERGE`, `EXEC`, `CREATE`, `GRANT`, `REVOKE`, `SELECT ... INTO`, `sp_executesql`, `xp_cmdshell`), comments used for smuggling, and multi-statement stacked injections.
2. **Encrypted Secret References (Zero Plaintext):**
   - Database credentials are encrypted and stored via **AWS Secrets Manager** (or the local authenticated AES-256-GCM vault).
   - SQLPilot's internal metadata database only stores an ARN reference (`secret_ref`), never plaintext passwords.
3. **Schema Metadata Only into LLM Prompts:**
   - Table names, column names, data types, nullability, primary keys, and foreign keys are fed into prompts.
   - **Query result rows and table data are NEVER passed to the LLM**, preventing data leaks.
4. **Parameterized Internal Queries:**
   - All internal metadata database queries use strictly parameterized `mssql` requests to prevent SQL injection in SQLPilot itself.

---

## 2. Tech Stack

- **Frontend:** Next.js 14, React 18, TypeScript, Tailwind CSS, React Flow (`@xyflow/react`), Monaco Editor (`@monaco-editor/react`), Lucide icons.
- **Backend:** Node.js, Express, TypeScript, `mssql` (Tedious driver), `node-sql-parser`, JWT, bcrypt, Zod.
- **Databases:**
  - **Connected Target DB:** Microsoft SQL Server 2022 (`mcr.microsoft.com/mssql/server:2022`).
  - **SQLPilot Metadata DB:** Microsoft SQL Server (`SQLPilotMeta`) with transparent local dev fallback.
- **AI / LLM:** Swappable LLM client supporting Google Gemini (`gemini-2.5-flash`), OpenAI, AWS Bedrock, or heuristic offline generator.

---

## 3. Quick Start (Local Development)

### A. Run SQL Server 2022 Container
```bash
docker-compose up -d sqlserver sql-init
```
This launches SQL Server 2022 and automatically initializes:
- `SQLPilotMeta` (SQLPilot's metadata store)
- `AdventureStore` (sample database with tables, foreign keys, and indexes)
- `sqlpilot_readonly` login (password: `ReadOnlyPass2026!`)

### B. Run API Backend
```bash
cd api
npm install
npm run build
npm start
# Server runs on http://localhost:4000
```

### C. Run Web Frontend
```bash
cd web
npm install
npm run dev
# Web app runs on http://localhost:3000
```

---

## 4. Verification & Testing

To run the comprehensive test suite for the **Read-Only Validator** (including mutation rejection, stacked queries, and comment smuggling):
```bash
cd api
npm test
```

---

## 5. API Endpoints

- `POST /api/auth/register` · `/api/auth/login` — Authentication & JWT
- `GET /api/connections` · `POST /api/connections` — List and create database connections
- `POST /api/connections/test` — Test connection credentials and latency
- `POST /api/connections/:id/introspect` — Schema introspection (`INFORMATION_SCHEMA` + `sys.foreign_keys`)
- `POST /api/connections/:id/ask` — Plain English question → Schema-grounded T-SQL + explanation
- `POST /api/connections/:id/run` — Validated read-only query execution (with timeout & row cap)
- `GET /api/connections/:id/performance` — DMV missing indexes & slow query diagnostics
- `GET /api/connections/:id/history` — Query execution history
- `GET /api/snippets` · `POST /api/snippets` — Saved query snippets library
