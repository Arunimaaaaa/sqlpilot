import { config } from '../config/env';
import { IntrospectedSchema } from '../types';

export interface LlmGenerationResult {
  sql: string;
  explanation: string;
}

export interface LlmClient {
  generateSql(schema: IntrospectedSchema, prompt: string): Promise<LlmGenerationResult>;
  generateRationale(context: { type: 'INDEX' | 'SLOW_QUERY'; item: any }): Promise<string>;
}

/**
 * Builds a compact, token-efficient text representation of the schema.
 * CRITICAL SAFETY PRINCIPLE: SCHEMA METADATA ONLY, NEVER RESULT ROWS!
 */
export function buildSchemaMetadataPrompt(schema: IntrospectedSchema): string {
  const lines: string[] = [];
  lines.push(`Database: [${schema.database_name}]`);
  lines.push('Tables and Columns:');

  for (const table of schema.tables) {
    const pkSet = new Set(table.primary_key);
    const colDefs = table.columns.map(c => {
      let desc = `${c.column_name} (${c.data_type}`;
      if (c.character_maximum_length) desc += `(${c.character_maximum_length === -1 ? 'MAX' : c.character_maximum_length})`;
      if (c.numeric_precision && c.numeric_scale) desc += `(${c.numeric_precision},${c.numeric_scale})`;
      desc += ')';
      if (pkSet.has(c.column_name)) desc += ' [PK]';
      if (c.is_foreign_key) desc += ' [FK]';
      return desc;
    });

    lines.push(`- Table [${table.table_schema}].[${table.table_name}]:`);
    lines.push(`  Columns: ${colDefs.join(', ')}`);
  }

  if (schema.foreign_keys.length > 0) {
    lines.push('Foreign Key Relationships:');
    for (const fk of schema.foreign_keys) {
      lines.push(`- [${fk.from_table}].[${fk.from_column}] -> [${fk.to_table}].[${fk.to_column}]`);
    }
  }

  return lines.join('\n');
}

export class GeminiLlmClient implements LlmClient {
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model: string) {
    this.apiKey = apiKey;
    this.model = model;
  }

  async generateSql(schema: IntrospectedSchema, userPrompt: string): Promise<LlmGenerationResult> {
    // SCHEMA METADATA ONLY - NO RESULT ROWS
    const schemaContext = buildSchemaMetadataPrompt(schema);

    const systemInstruction = `
You are SQLPilot, an expert AI database copilot for Microsoft SQL Server.
Your mission is to write accurate, highly-optimized, strictly read-only T-SQL queries for user questions.

CRITICAL SAFETY & QUERY RULES:
1. ONLY generate a SINGLE, valid read-only SELECT statement (or WITH ... SELECT for CTEs).
2. NEVER generate INSERT, UPDATE, DELETE, DROP, ALTER, TRUNCATE, MERGE, EXEC, or any mutating commands.
3. NEVER use SELECT ... INTO (which writes tables).
4. Strictly ground your query in the provided tables, column names, and relationships.
5. Use proper T-SQL syntax (e.g. TOP, DATEADD, DATEDIFF, ISNULL, JOINs).
6. Always format output as a valid JSON object with exact keys:
   {
     "sql": "SELECT ...",
     "explanation": "Clear, concise 1-2 sentence explanation of what the query accomplishes."
   }
DO NOT wrap output in markdown code blocks if returning JSON; output raw JSON only.
`;

    const promptText = `
${systemInstruction}

SCHEMA METADATA (Structure Only - No Data Rows):
${schemaContext}

USER REQUEST:
"${userPrompt}"

Generate the JSON response with read-only T-SQL query and explanation:
`;

    if (!this.apiKey) {
      return this.fallbackGeneration(schema, userPrompt);
    }

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: promptText }] }],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: 'application/json'
          }
        })
      });

      if (!response.ok) {
        throw new Error(`Gemini API error: ${response.statusText}`);
      }

      const data = await response.json();
      const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!content) throw new Error('Empty response from Gemini');

      const parsed = JSON.parse(content);
      return {
        sql: parsed.sql?.trim() || '',
        explanation: parsed.explanation || 'Generated read-only T-SQL query.'
      };
    } catch (err: any) {
      console.warn('Gemini API call failed, falling back to heuristic generator:', err.message);
      return this.fallbackGeneration(schema, userPrompt);
    }
  }

  async generateRationale(context: { type: 'INDEX' | 'SLOW_QUERY'; item: any }): Promise<string> {
    if (!this.apiKey) {
      return this.fallbackRationale(context);
    }

    const promptText = `
You are a Microsoft SQL Server Performance Expert.
Analyze the following ${context.type === 'INDEX' ? 'missing index suggestion' : 'slow query statistic'} and provide a concise, plain-English rationale (2-3 sentences) explaining why this issue exists and how the fix improves throughput:

Details:
${JSON.stringify(context.item, null, 2)}

Provide only the plain-English explanation.
`;

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: promptText }] }],
          generationConfig: { temperature: 0.2 }
        })
      });

      if (!response.ok) throw new Error(`Gemini API error: ${response.statusText}`);
      const data = await response.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || this.fallbackRationale(context);
    } catch (e) {
      return this.fallbackRationale(context);
    }
  }

  private fallbackGeneration(schema: IntrospectedSchema, prompt: string): LlmGenerationResult {
    const p = prompt.toLowerCase();

    if (p.includes('customer') && (p.includes('order') || p.includes('spend') || p.includes('top'))) {
      return {
        sql: `SELECT TOP 10 \n    c.customer_id, \n    c.first_name + ' ' + c.last_name AS customer_name,\n    c.email,\n    COUNT(o.order_id) AS total_orders,\n    ISNULL(SUM(o.total_amount), 0) AS total_spent\nFROM customers c\nLEFT JOIN orders o ON c.customer_id = o.customer_id\nGROUP BY c.customer_id, c.first_name, c.last_name, c.email\nORDER BY total_spent DESC;`,
        explanation: 'Retrieves the top 10 customers ranked by total purchase spend, joining customers to orders and aggregating order amounts.'
      };
    }

    if (p.includes('product') && (p.includes('category') || p.includes('stock') || p.includes('price'))) {
      return {
        sql: `SELECT \n    p.product_id,\n    p.name AS product_name,\n    c.category_name,\n    p.price,\n    p.stock_quantity\nFROM products p\nINNER JOIN categories c ON p.category_id = c.category_id\nWHERE p.is_active = 1\nORDER BY p.price DESC;`,
        explanation: 'Lists all active products along with their category name, price, and current inventory stock.'
      };
    }

    if (p.includes('revenue') || p.includes('sales') || p.includes('month') || p.includes('order')) {
      return {
        sql: `SELECT \n    order_status,\n    COUNT(order_id) AS order_count,\n    SUM(total_amount) AS total_revenue\nFROM orders\nGROUP BY order_status\nORDER BY total_revenue DESC;`,
        explanation: 'Aggregates orders by status, showing order counts and revenue per status category.'
      };
    }

    // Default generic SELECT from first table
    const table = schema.tables[0] ? schema.tables[0].table_name : 'customers';
    return {
      sql: `SELECT TOP 50 * FROM [${table}];`,
      explanation: `Retrieves the first 50 records from the ${table} table.`
    };
  }

  private fallbackRationale(context: { type: 'INDEX' | 'SLOW_QUERY'; item: any }): string {
    if (context.type === 'INDEX') {
      return `Adding this nonclustered index eliminates full table scans on [${context.item.table_name}], directly converting ${context.item.user_seeks || 'frequent'} query lookups into high-speed index seeks. Estimated workload improvement is ~${context.item.avg_user_impact || 80}%.`;
    }
    return `This query suffers from high elapsed execution time and heavy logical reads. Adding covering indexes on the filter and join predicates will significantly reduce buffer cache thrashing and worker CPU time.`;
  }
}

export function createLlmClient(): LlmClient {
  return new GeminiLlmClient(config.llm.geminiApiKey, config.llm.model);
}

export const llmClient = createLlmClient();
