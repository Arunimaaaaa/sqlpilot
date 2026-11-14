import { introspectService } from '../services/introspect.service';
import { readOnlyValidator } from '../services/validator.service';
import { llmClient } from './client';

export class Nl2SqlService {
  /**
   * Generates schema-grounded, strictly validated read-only T-SQL for a natural language prompt.
   * Enforces that SCHEMA METADATA ONLY is sent to the LLM, and validates the output query.
   */
  async generateQuery(
    userId: number,
    connectionId: number,
    prompt: string
  ): Promise<{ sql: string; explanation: string; is_valid: boolean; error?: string }> {
    if (!prompt || prompt.trim().length === 0) {
      throw new Error('Question prompt cannot be empty');
    }

    // 1. Load schema metadata (NEVER ROW DATA!)
    const schema = await introspectService.introspectDatabase(userId, connectionId);

    // 2. LLM Call with SCHEMA METADATA ONLY
    const generated = await llmClient.generateSql(schema, prompt.trim());

    // 3. Immediately run the Read-Only Guardrail Validator
    const validation = readOnlyValidator.validate(generated.sql);
    if (!validation.is_valid) {
      return {
        sql: generated.sql,
        explanation: generated.explanation,
        is_valid: false,
        error: `LLM generated query was rejected by safety guardrail: ${validation.error}`
      };
    }

    return {
      sql: validation.sanitized_sql || generated.sql,
      explanation: generated.explanation,
      is_valid: true
    };
  }
}

export const nl2SqlService = new Nl2SqlService();
