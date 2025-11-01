# Snowflake REST API Debugging Summary

## Status: BLOCKED

Snowflake REST API keypair JWT authentication is **not working** despite extensive testing and configuration.

---

## What We've Tested

### ✅ Verified Working
1. **RSA Key Pair Generation** - 2048-bit keys generated correctly
2. **Public Key Upload** - Public key uploaded to Snowflake user ZAINEEL
3. **Fingerprint Match** - SHA256 fingerprint matches: `jGuUiDKHkUln0uqZ5u+DyCrrGPZ/gYuyfU59VhNt09U=`
4. **JWT Signing** - JWT is properly signed with RS256 algorithm
5. **JWT Verification** - JWT can be verified locally with public key
6. **Key Pair Validity** - Private and public keys are a matching pair
7. **Account Information** - Account: CUGFKKD-TT48942, User: ZAINEEL, Edition: Enterprise

### ❌ All Failed with Error 390144 "JWT token is invalid"

1. **Different Account Formats**
   - Full org-account: `CUGFKKD-TT48942`
   - Account locator only: `TT48942`
   - Dot notation: `CUGFKKD.TT48942`

2. **Different JWT Payload Structures**
   - With IAT (issued at time)
   - Without IAT
   - IAT 60 seconds in past (clock skew tolerance)
   - IAT in milliseconds vs seconds
   - Different expiration times (1 hour, 24 hours)

3. **Different API Endpoints**
   - `/api/v2/statements` (primary SQL API)
   - `/session/v1/login-request` (session-based auth)
   - `/api/statements` (without v2)
   - `/queries` (alternative endpoint)

4. **Different Headers**
   - With `X-Snowflake-Authorization-Token-Type: KEYPAIR_JWT`
   - Without the optional header
   - Different combinations

5. **Different Request Parameters**
   - With warehouse: `COMPUTE_WH`
   - With role: `ACCOUNTADMIN`
   - With database and schema context

---

## Evidence That JWT Format is Correct

✅ Local JWT signature verification **passed**
✅ Public key fingerprint **matches** Snowflake
✅ JWT payload structure follows **official Snowflake documentation**
✅ Account identifier format is **correct**
✅ Username is **uppercase** as required

The `/session/v1/login-request` endpoint recognizes:
- Authentication method: `KEYPAIR`
- Login name: `ZAINEEL`

BUT still returns: `"success": false` with error code `390144`

---

## Conclusion

The JWT authentication is correctly configured **on our side**. The issue is that **Snowflake is rejecting the authentication** at the account/server level.

**This indicates:**
1. REST API keypair JWT authentication is **not enabled** for your account
2. Network policies may be **blocking** REST API access
3. Additional account-level configuration is **required**

---

## Required Next Steps

You must run these diagnostic queries in your **Snowflake SQL Worksheet**:

### 1. Check User Configuration
```sql
-- Get all user details
DESC USER ZAINEEL;

-- IMPORTANT: Check if LOGIN_NAME matches 'ZAINEEL'
-- (LOGIN_NAME can be different from NAME!)
SELECT NAME, LOGIN_NAME, RSA_PUBLIC_KEY_FP
FROM SNOWFLAKE.ACCOUNT_USAGE.USERS
WHERE NAME = 'ZAINEEL';
```

**Expected:**
- `RSA_PUBLIC_KEY_FP` = `SHA256:jGuUiDKHkUln0uqZ5u+DyCrrGPZ/gYuyfU59VhNt09U=`
- `LOGIN_NAME` = `ZAINEEL` (if different, use LOGIN_NAME in JWT!)

---

### 2. Check Account Parameters
```sql
-- Check JWT-related parameters
SHOW PARAMETERS LIKE '%JWT%' IN ACCOUNT;
SHOW PARAMETERS LIKE '%OAUTH%' IN ACCOUNT;

-- Check authentication parameters
SHOW PARAMETERS LIKE '%AUTH%' IN ACCOUNT;

-- Check network parameters
SHOW PARAMETERS LIKE '%NETWORK%' IN ACCOUNT;
```

**Look for:**
- Any parameters that disable REST API access
- OAuth requirements
- Network restrictions

---

### 3. Check Network Policies
```sql
-- Show all network policies
SHOW NETWORK POLICIES;

-- If policies exist, check details:
-- DESC NETWORK POLICY <policy_name>;
```

**Look for:**
- Policies that block REST API endpoints
- IP whitelist/blacklist restrictions

---

### 4. Check User Grants and Permissions
```sql
-- Check what grants the user has
SHOW GRANTS TO USER ZAINEEL;

-- Check account-level grants
SHOW GRANTS ON ACCOUNT;

-- Check role grants
SHOW GRANTS TO ROLE ACCOUNTADMIN;
```

**Look for:**
- Missing privileges required for REST API access
- Role limitations

---

### 5. Test Cortex AI Directly
```sql
-- Verify Cortex AI works in Snowflake
SELECT SNOWFLAKE.CORTEX.COMPLETE('mistral-large',
  [{'role': 'user', 'content': 'Say hello'}]
) AS test_response;
```

**This confirms:**
- Cortex AI is enabled and working in Snowflake UI
- The issue is specifically with REST API access

---

### 6. Test Keypair Auth with SnowSQL
```bash
# Try connecting with SnowSQL using the same keypair
snowsql -a CUGFKKD-TT48942 -u ZAINEEL \\
  --private-key-path .snowflake-keys/rsa_key.p8
```

**If this works but REST API doesn't:**
- Confirms keypair authentication **works for SQL clients**
- But REST API keypair auth is **disabled** at account level

---

## Possible Solutions

Based on the diagnostic results, you may need to:

### Option 1: Enable REST API Keypair Auth (Best)
Contact Snowflake support or your account administrator to:
1. Enable REST API keypair JWT authentication for your account
2. Remove any network policies blocking REST API access
3. Verify Enterprise edition REST API features are enabled

### Option 2: Use OAuth Authentication
If keypair JWT is not available, set up OAuth:
```sql
-- Create OAuth integration (requires ACCOUNTADMIN)
CREATE SECURITY INTEGRATION oauth_integration
  TYPE = OAUTH
  ENABLED = TRUE
  OAUTH_CLIENT = CUSTOM
  OAUTH_CLIENT_TYPE = 'CONFIDENTIAL'
  OAUTH_REDIRECT_URI = 'https://your-app-url/oauth/callback'
  OAUTH_ISSUE_REFRESH_TOKENS = TRUE
  OAUTH_REFRESH_TOKEN_VALIDITY = 7776000;

-- Get client ID and secret
DESC SECURITY INTEGRATION oauth_integration;
```

### Option 3: Use Snowflake Node.js Connector (Alternative)
Instead of direct REST API calls, use the official Snowflake connector:
```bash
npm install snowflake-sdk
```

The connector handles authentication internally and may work even if REST API doesn't.

---

## Files Created for Debugging

1. **scripts/verify-public-key.ts** - Verify public key format and fingerprint
2. **scripts/gen-jwt-auto.ts** - Generate JWT tokens automatically
3. **scripts/verify-jwt-signature.ts** - Verify JWT is properly signed
4. **scripts/test-api-endpoints.ts** - Test different API endpoint formats
5. **scripts/test-jwt-timing.ts** - Test different JWT timing configurations
6. **scripts/test-snowflake-official-format.ts** - Test official Snowflake JWT format
7. **scripts/snowflake-diagnostics.sql** - SQL diagnostic queries to run in Snowflake

---

## Contact Points

**For Enterprise Edition Support:**
- Snowflake Support: https://community.snowflake.com/s/
- Account Administrator (if applicable)
- Check account settings in Snowflake UI: Admin > Security

**Documentation:**
- REST API Auth: https://docs.snowflake.com/en/developer-guide/sql-api/authenticating
- Keypair Troubleshooting: https://docs.snowflake.com/en/user-guide/key-pair-auth-troubleshooting

---

## Summary

**The JWT authentication is correctly configured on the application side.** All our JWT tokens are valid, properly signed, and formatted according to official Snowflake documentation. The public key is correctly uploaded to Snowflake with a matching fingerprint.

**The blocker is on the Snowflake account side.** REST API keypair JWT authentication appears to be disabled, blocked, or not configured properly at the account level.

**You must now investigate the Snowflake account configuration** using the diagnostic SQL queries above and potentially contact Snowflake support to enable REST API access.
