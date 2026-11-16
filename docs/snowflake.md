# Snowflake Cortex

Proof text is validated by Snowflake Cortex (`SNOWFLAKE.CORTEX.COMPLETE`, model `mistral-large`) through the official `snowflake-sdk` with **key-pair (JWT) authentication**. An earlier attempt to call the Snowflake REST API with hand-built JWTs was abandoned and its debugging scripts were removed; do not reintroduce that route.

Code: `lib/snowflake/client.ts` (connection and Cortex helpers), `lib/snowflake/validation.ts` (proof validation), `lib/snowflake/prompt-safety.ts` (untrusted-text fencing and output parsing).

## Requirements

- A Snowflake account where Cortex is available in its region (trial accounts work; model availability varies by region and cloud).
- A user and a warehouse that user can use.

## Create the key pair

```bash
bash scripts/generate-snowflake-keys.sh
```

This writes an unencrypted PKCS#8 private key `.snowflake-keys/rsa_key.p8` and `rsa_key.pub` (the directory is gitignored) and prints the statement to register the public key:

```sql
ALTER USER <your_username> SET RSA_PUBLIC_KEY='<public key body without BEGIN/END lines>';
DESC USER <your_username>;   -- confirm RSA_PUBLIC_KEY_FP is set
```

## Environment variables

| Variable | Notes |
| --- | --- |
| `SNOWFLAKE_ACCOUNT` | Required. Account identifier, `orgname-accountname` form (or the legacy locator with region). |
| `SNOWFLAKE_USERNAME` | The user that holds the public key. Required: there is no fallback, and a missing value fails with a clear config error. |
| `SNOWFLAKE_WAREHOUSE` | Defaults to `COMPUTE_WH`. |
| `SNOWFLAKE_PRIVATE_KEY` | Base64 of the whole PEM file, BEGIN/END lines included: `base64 < .snowflake-keys/rsa_key.p8 \| tr -d '\n'`. If unset, the code falls back to `.snowflake-keys/rsa_key.p8` on disk (local development only; use the env var on Vercel). |

Never commit the private key and never put it in a `NEXT_PUBLIC_` variable. If a key is ever committed or pasted somewhere public, rotate it (set a new `RSA_PUBLIC_KEY` on the user) and replace the env var.

## Verify

```bash
SNOWFLAKE_ACCOUNT=... SNOWFLAKE_USERNAME=... SNOWFLAKE_WAREHOUSE=... npx tsx scripts/test-cortex-sdk.ts
```

`GET /api/health` also reports the `snowflake` service status.

## Troubleshooting

- JWT token is invalid: the public key on the user does not match the private key, or `SNOWFLAKE_USERNAME` or `SNOWFLAKE_ACCOUNT` is wrong. Re-run `ALTER USER ... SET RSA_PUBLIC_KEY` and check `DESC USER`.
- "Decoded key does not appear to be a valid PEM format": `SNOWFLAKE_PRIVATE_KEY` must be the base64 of the PEM, not the raw PEM and not the public key.
- Cortex function or model not found: the model is not available in your region. Models are chosen in `lib/snowflake/validation.ts`.
- Connection refused or blocked: check `SHOW NETWORK POLICIES` for the user and account.

## Behaviour to know

Validation fails closed: an AI error, malformed output or suspected prompt injection yields `needs_review` (an admin decides in `/admin`), never an automatic approval. Image proofs are not analyzed by the AI; only the proof text is.
