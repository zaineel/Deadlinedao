/**
 * Snowflake Cortex API Client
 * Uses Snowflake Node.js SDK with keypair authentication
 */

import snowflake from "snowflake-sdk";
import crypto from "crypto";

interface SnowflakeConfig {
  account: string;
  username: string;
  warehouse?: string;
  database?: string;
  schema?: string;
}

/**
 * Get Snowflake configuration from environment
 */
function getSnowflakeConfig(): SnowflakeConfig {
  const account = process.env.SNOWFLAKE_ACCOUNT;
  const username = process.env.SNOWFLAKE_USERNAME || "ZAINEEL";
  const warehouse = process.env.SNOWFLAKE_WAREHOUSE || "COMPUTE_WH";

  if (!account)
    throw new Error("Missing SNOWFLAKE_ACCOUNT environment variable");

  return { account, username, warehouse };
}

/**
 * Create Snowflake connection with keypair authentication
 */
function createConnection(): snowflake.Connection {
  const config = getSnowflakeConfig();
  let privateKey: crypto.KeyObject;

  try {
    if (process.env.SNOWFLAKE_PRIVATE_KEY) {
      console.log("[Snowflake] Using private key from environment");
      const cleaned = process.env.SNOWFLAKE_PRIVATE_KEY.trim().replace(
        /\s+/g,
        ""
      );
      const keyData = Buffer.from(cleaned, "base64");

      privateKey = crypto.createPrivateKey({
        key: keyData,
        format: "der",
        type: "pkcs8",
      });
    } else {
      console.log("[Snowflake] Using local .p8 key");
      const fs = require("fs");
      const path = require("path");
      const pem = fs.readFileSync(
        path.join(process.cwd(), ".snowflake-keys", "rsa_key.p8"),
        "utf8"
      );

      privateKey = crypto.createPrivateKey({
        key: pem,
        format: "pem",
        type: "pkcs8",
      });
    }
  } catch (err) {
    console.error("[Snowflake] Failed to read or parse private key:", err);
    throw err;
  }

  const connection = snowflake.createConnection({
    account: config.account,
    username: config.username,
    authenticator: "SNOWFLAKE_JWT",
    privateKey: privateKey as any, // TS expects string; runtime accepts KeyObject
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
        console.error("[Snowflake] Connection error:", err);
        return resolve({ data: null, error: err });
      }

      conn.execute({
        sqlText: query,
        binds: bindings,
        complete: (err, stmt, rows) => {
          connection.destroy(() => {});
          if (err) {
            console.error("[Snowflake] Query error:", err);
            return resolve({ data: null, error: err });
          }
          resolve({ data: rows, error: null });
        },
      });
    });
  });
}

/* ------------------ Cortex API Helpers ------------------ */

export async function cortexComplete(
  model:
    | "claude-3-5-sonnet"
    | "mistral-large"
    | "mistral-7b"
    | "llama3-70b"
    | "mixtral-8x7b",
  prompt: string
): Promise<{ completion: string | null; error: Error | null }> {
  try {
    const query = `SELECT SNOWFLAKE.CORTEX.COMPLETE(?, ?) AS completion;`;
    const { data, error } = await executeSnowflakeQuery(query, [model, prompt]);
    if (error) return { completion: null, error };
    return { completion: data?.[0]?.COMPLETION || null, error: null };
  } catch (error) {
    console.error("Cortex COMPLETE error:", error);
    return { completion: null, error: error as Error };
  }
}

export async function cortexSentiment(
  text: string
): Promise<{ sentiment: number | null; error: Error | null }> {
  try {
    const query = `SELECT SNOWFLAKE.CORTEX.SENTIMENT(?) AS sentiment;`;
    const { data, error } = await executeSnowflakeQuery(query, [text]);
    if (error) return { sentiment: null, error };
    return { sentiment: data?.[0]?.SENTIMENT || null, error: null };
  } catch (error) {
    console.error("Cortex SENTIMENT error:", error);
    return { sentiment: null, error: error as Error };
  }
}

export async function cortexClassify(
  text: string,
  categories: string[]
): Promise<{
  category: string | null;
  confidence: number | null;
  error: Error | null;
}> {
  try {
    const categoriesStr = categories.map((c) => `'${c}'`).join(", ");
    const query = `
      SELECT SNOWFLAKE.CORTEX.CLASSIFY_TEXT(
        ?,
        ARRAY_CONSTRUCT(${categoriesStr})
      ) AS result;
    `;
    const { data, error } = await executeSnowflakeQuery(query, [text]);
    if (error) return { category: null, confidence: null, error };

    const result = data?.[0]?.RESULT;
    if (!result) return { category: null, confidence: null, error: null };

    const parsed = typeof result === "string" ? JSON.parse(result) : result;
    return {
      category: parsed.category,
      confidence: parsed.confidence,
      error: null,
    };
  } catch (error) {
    console.error("Cortex CLASSIFY_TEXT error:", error);
    return { category: null, confidence: null, error: error as Error };
  }
}

export async function cortexSummarize(
  text: string
): Promise<{ summary: string | null; error: Error | null }> {
  try {
    const query = `SELECT SNOWFLAKE.CORTEX.SUMMARIZE(?) AS summary;`;
    const { data, error } = await executeSnowflakeQuery(query, [text]);
    if (error) return { summary: null, error };
    return { summary: data?.[0]?.SUMMARY || null, error: null };
  } catch (error) {
    console.error("Cortex SUMMARIZE error:", error);
    return { summary: null, error: error as Error };
  }
}

/**
 * Health check
 */
export async function healthCheck(): Promise<{
  healthy: boolean;
  error: Error | null;
}> {
  const { data, error } = await executeSnowflakeQuery("SELECT 1 AS test;");
  return { healthy: !error, error };
}

/**
 * Simple availability test
 */
export async function testCortexAvailability(): Promise<{
  available: boolean;
  models: string[];
  error: Error | null;
}> {
  const { completion, error } = await cortexComplete("mistral-7b", 'Say "OK"');
  return {
    available: !error && completion === "OK",
    models: [
      "claude-3-5-sonnet",
      "mistral-large",
      "mistral-7b",
      "llama3-70b",
      "mixtral-8x7b",
    ],
    error,
  };
}
