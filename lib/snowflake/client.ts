/**
 * Snowflake Cortex API Client
 * Uses Snowflake's SQL API to execute CORTEX AI functions
 */

interface SnowflakeConfig {
  account: string;
  apiEndpoint: string;
  jwtToken: string;
}

/**
 * Get Snowflake configuration from environment
 */
function getSnowflakeConfig(): SnowflakeConfig {
  const account = process.env.SNOWFLAKE_ACCOUNT;
  const apiEndpoint = process.env.SNOWFLAKE_API_ENDPOINT;
  const jwtToken = process.env.SNOWFLAKE_JWT_TOKEN;

  if (!account || !apiEndpoint || !jwtToken) {
    throw new Error('Missing Snowflake environment variables. Check SNOWFLAKE_ACCOUNT, SNOWFLAKE_API_ENDPOINT, and SNOWFLAKE_JWT_TOKEN');
  }

  return { account, apiEndpoint, jwtToken };
}

/**
 * Execute a Snowflake SQL query
 */
async function executeSnowflakeQuery(
  query: string,
  bindings?: Record<string, any>
): Promise<{ data: any; error: Error | null }> {
  try {
    const config = getSnowflakeConfig();

    const response = await fetch(`${config.apiEndpoint}/api/v2/statements`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.jwtToken}`,
        'X-Snowflake-Authorization-Token-Type': 'KEYPAIR_JWT',
      },
      body: JSON.stringify({
        statement: query,
        timeout: 60,
        bindings,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Snowflake API error: ${response.status} ${errorText}`);
    }

    const result = await response.json();

    // Handle async execution
    if (result.statementHandle) {
      // Poll for results
      const data = await pollForResults(result.statementHandle);
      return { data, error: null };
    }

    return { data: result.data, error: null };
  } catch (error) {
    console.error('Snowflake query error:', error);
    return { data: null, error: error as Error };
  }
}

/**
 * Poll for async query results
 */
async function pollForResults(statementHandle: string, maxAttempts: number = 30): Promise<any> {
  const config = getSnowflakeConfig();

  for (let i = 0; i < maxAttempts; i++) {
    const response = await fetch(
      `${config.apiEndpoint}/api/v2/statements/${statementHandle}`,
      {
        headers: {
          'Authorization': `Bearer ${config.jwtToken}`,
          'X-Snowflake-Authorization-Token-Type': 'KEYPAIR_JWT',
        },
      }
    );

    const result = await response.json();

    if (result.status === 'success') {
      return result.data;
    }

    if (result.status === 'failed') {
      throw new Error(`Query failed: ${result.message}`);
    }

    // Wait 2 seconds before next poll
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  throw new Error('Query timeout: Results not ready after 60 seconds');
}

/**
 * Call Snowflake Cortex COMPLETE function (LLM completion)
 * Supports Claude, Mistral, Llama models
 */
export async function cortexComplete(
  model: 'claude-3-5-sonnet' | 'mistral-large' | 'llama3-70b' | 'mixtral-8x7b',
  prompt: string,
  options?: {
    temperature?: number;
    maxTokens?: number;
  }
): Promise<{ completion: string | null; error: Error | null }> {
  try {
    const temperature = options?.temperature ?? 0.7;
    const maxTokens = options?.maxTokens ?? 2000;

    // Using Snowflake Cortex COMPLETE function
    const query = `
      SELECT SNOWFLAKE.CORTEX.COMPLETE(
        '${model}',
        [
          {'role': 'user', 'content': :prompt}
        ],
        {
          'temperature': ${temperature},
          'max_tokens': ${maxTokens}
        }
      ) AS completion;
    `;

    const { data, error } = await executeSnowflakeQuery(query, { prompt });

    if (error) {
      return { completion: null, error };
    }

    const completion = data?.[0]?.[0] || null;
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
      SELECT SNOWFLAKE.CORTEX.SENTIMENT(:text) AS sentiment;
    `;

    const { data, error } = await executeSnowflakeQuery(query, { text });

    if (error) {
      return { sentiment: null, error };
    }

    const sentiment = data?.[0]?.[0] || null;
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
        :text,
        ARRAY_CONSTRUCT(${categoriesStr})
      ) AS result;
    `;

    const { data, error } = await executeSnowflakeQuery(query, { text });

    if (error) {
      return { category: null, confidence: null, error };
    }

    const result = data?.[0]?.[0];

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
      SELECT SNOWFLAKE.CORTEX.SUMMARIZE(:text) AS summary;
    `;

    const { data, error } = await executeSnowflakeQuery(query, { text });

    if (error) {
      return { summary: null, error };
    }

    const summary = data?.[0]?.[0] || null;
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
    // Test with a simple prompt
    const { completion, error } = await cortexComplete(
      'mistral-large',
      'Say "OK" if you can read this.',
      { temperature: 0, maxTokens: 10 }
    );

    if (error) {
      return { available: false, models: [], error };
    }

    return {
      available: true,
      models: ['claude-3-5-sonnet', 'mistral-large', 'llama3-70b', 'mixtral-8x7b'],
      error: null,
    };
  } catch (error) {
    console.error('Cortex availability test failed:', error);
    return { available: false, models: [], error: error as Error };
  }
}
