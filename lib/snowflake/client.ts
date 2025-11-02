/**
 * Snowflake Cortex API Client
 * Uses Snowflake Node.js SDK with keypair authentication
 */

import snowflake from 'snowflake-sdk';
import { readFileSync } from 'fs';
import { join } from 'path';

interface SnowflakeConfig {
  account: string;
  username: string;
  privateKeyPath: string;
  warehouse?: string;
  database?: string;
  schema?: string;
}

/**
 * Get Snowflake configuration from environment
 */
function getSnowflakeConfig(): SnowflakeConfig {
  const account = process.env.SNOWFLAKE_ACCOUNT;
  const username = process.env.SNOWFLAKE_USERNAME || 'ZAINEEL';
  const warehouse = process.env.SNOWFLAKE_WAREHOUSE || 'COMPUTE_WH';

  if (!account) {
    throw new Error('Missing SNOWFLAKE_ACCOUNT environment variable');
  }

  // Private key path
  const privateKeyPath = join(process.cwd(), '.snowflake-keys', 'rsa_key.p8');

  return {
    account,
    username,
    privateKeyPath,
    warehouse,
  };
}

/**
 * Create Snowflake connection with keypair authentication
 */
function createConnection(): snowflake.Connection {
  const config = getSnowflakeConfig();

  // Read private key
  const privateKeyData = readFileSync(config.privateKeyPath, 'utf8');

  const connection = snowflake.createConnection({
    account: config.account,
    username: config.username,
    authenticator: 'SNOWFLAKE_JWT',
    privateKey: privateKeyData,
    warehouse: config.warehouse,
  });

  return connection;
}

/**
 * Execute a Snowflake SQL query
 */
async function executeSnowflakeQuery(
  query: string,
  bindings?: any[]
): Promise<{ data: any; error: Error | null }> {
  return new Promise((resolve) => {
    const connection = createConnection();

    connection.connect((err, conn) => {
      if (err) {
        console.error('Connection error:', err);
        return resolve({ data: null, error: err });
      }

      conn.execute({
        sqlText: query,
        binds: bindings,
        complete: (err, stmt, rows) => {
          // Always destroy connection after query
          connection.destroy((destroyErr) => {
            if (destroyErr) {
              console.error('Error destroying connection:', destroyErr);
            }
          });

          if (err) {
            console.error('Query error:', err);
            return resolve({ data: null, error: err });
          }

          resolve({ data: rows, error: null });
        },
      });
    });
  });
}

/**
 * Call Snowflake Cortex COMPLETE function (LLM completion)
 * Supports Claude, Mistral, Llama models
 */
export async function cortexComplete(
  model: 'claude-3-5-sonnet' | 'mistral-large' | 'mistral-7b' | 'llama3-70b' | 'mixtral-8x7b',
  prompt: string,
  options?: {
    temperature?: number;
    maxTokens?: number;
  }
): Promise<{ completion: string | null; error: Error | null }> {
  try {
    // Simplified syntax - just model and prompt as string
    const query = `
      SELECT SNOWFLAKE.CORTEX.COMPLETE(?, ?) AS completion;
    `;

    const { data, error } = await executeSnowflakeQuery(query, [model, prompt]);

    if (error) {
      return { completion: null, error };
    }

    const completion = data?.[0]?.COMPLETION || null;
    return { completion, error: null };
  } catch (error) {
    console.error('Cortex COMPLETE error:', error);
    return { completion: null, error: error as Error };
  }
}

/**
 * Call Snowflake Cortex SENTIMENT function
 * Returns sentiment score between -1 (negative) and 1 (positive)
 */
export async function cortexSentiment(
  text: string
): Promise<{ sentiment: number | null; error: Error | null }> {
  try {
    const query = `
      SELECT SNOWFLAKE.CORTEX.SENTIMENT(?) AS sentiment;
    `;

    const { data, error } = await executeSnowflakeQuery(query, [text]);

    if (error) {
      return { sentiment: null, error };
    }

    const sentiment = data?.[0]?.SENTIMENT || null;
    return { sentiment, error: null };
  } catch (error) {
    console.error('Cortex SENTIMENT error:', error);
    return { sentiment: null, error: error as Error };
  }
}

/**
 * Call Snowflake Cortex CLASSIFY_TEXT function
 * Classifies text into predefined categories
 */
export async function cortexClassify(
  text: string,
  categories: string[]
): Promise<{ category: string | null; confidence: number | null; error: Error | null }> {
  try {
    const categoriesStr = categories.map(c => `'${c}'`).join(', ');

    const query = `
      SELECT SNOWFLAKE.CORTEX.CLASSIFY_TEXT(
        ?,
        ARRAY_CONSTRUCT(${categoriesStr})
      ) AS result;
    `;

    const { data, error } = await executeSnowflakeQuery(query, [text]);

    if (error) {
      return { category: null, confidence: null, error };
    }

    const result = data?.[0]?.RESULT;

    if (!result) {
      return { category: null, confidence: null, error: null };
    }

    // Parse result (format: {"category": "...", "confidence": ...})
    const parsed = typeof result === 'string' ? JSON.parse(result) : result;

    return {
      category: parsed.category,
      confidence: parsed.confidence,
      error: null,
    };
  } catch (error) {
    console.error('Cortex CLASSIFY_TEXT error:', error);
    return { category: null, confidence: null, error: error as Error };
  }
}

/**
 * Call Snowflake Cortex SUMMARIZE function
 */
export async function cortexSummarize(
  text: string
): Promise<{ summary: string | null; error: Error | null }> {
  try {
    const query = `
      SELECT SNOWFLAKE.CORTEX.SUMMARIZE(?) AS summary;
    `;

    const { data, error } = await executeSnowflakeQuery(query, [text]);

    if (error) {
      return { summary: null, error };
    }

    const summary = data?.[0]?.SUMMARY || null;
    return { summary, error: null };
  } catch (error) {
    console.error('Cortex SUMMARIZE error:', error);
    return { summary: null, error: error as Error };
  }
}

/**
 * Health check for Snowflake connection
 */
export async function healthCheck(): Promise<{ healthy: boolean; error: Error | null }> {
  try {
    const { data, error } = await executeSnowflakeQuery('SELECT 1 AS test;');

    if (error) {
      return { healthy: false, error };
    }

    return { healthy: true, error: null };
  } catch (error) {
    console.error('Snowflake health check failed:', error);
    return { healthy: false, error: error as Error };
  }
}

/**
 * Test Cortex availability
 */
export async function testCortexAvailability(): Promise<{
  available: boolean;
  models: string[];
  error: Error | null;
}> {
  try {
    // Test with a simple prompt using mistral-7b (smaller, faster model)
    const { completion, error } = await cortexComplete(
      'mistral-7b',
      'Say "OK"'
    );

    if (error) {
      return { available: false, models: [], error };
    }

    return {
      available: true,
      models: ['claude-3-5-sonnet', 'mistral-large', 'mistral-7b', 'llama3-70b', 'mixtral-8x7b'],
      error: null,
    };
  } catch (error) {
    console.error('Cortex availability test failed:', error);
    return { available: false, models: [], error: error as Error };
  }
}
