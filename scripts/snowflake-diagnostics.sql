-- ============================================================================
-- Snowflake Account Diagnostics
-- Run these queries in your Snowflake SQL worksheet to diagnose
-- why REST API keypair authentication is failing
-- ============================================================================

-- 1. Check user details and RSA public key configuration
-- ============================================================================
DESC USER ZAINEEL;

-- Expected output should include:
-- RSA_PUBLIC_KEY: (your public key without headers)
-- RSA_PUBLIC_KEY_FP: SHA256:jGuUiDKHkUln0uqZ5u+DyCrrGPZ/gYuyfU59VhNt09U=


-- 2. Check account parameters related to authentication
-- ============================================================================
SHOW PARAMETERS LIKE '%JWT%' IN ACCOUNT;
SHOW PARAMETERS LIKE '%OAUTH%' IN ACCOUNT;
SHOW PARAMETERS LIKE '%AUTH%' IN ACCOUNT;


-- 3. Check network policies that might block REST API
-- ============================================================================
SHOW NETWORK POLICIES;

-- If you have network policies, check their details:
-- DESC NETWORK POLICY <policy_name>;


-- 4. Check user grants and roles
-- ============================================================================
SHOW GRANTS TO USER ZAINEEL;
SHOW GRANTS TO ROLE ACCOUNTADMIN;


-- 5. Check if REST API endpoints are accessible
-- ============================================================================
SHOW PARAMETERS LIKE '%NETWORK%' IN ACCOUNT;


-- 6. Test keypair authentication with SnowSQL connection
-- ============================================================================
-- Try connecting with SnowSQL using the same keypair:
-- snowsql -a CUGFKKD-TT48942 -u ZAINEEL --private-key-path /path/to/rsa_key.p8

-- If SnowSQL works but REST API doesn't, this confirms REST API keypair auth
-- is disabled at the account level


-- 7. Check account edition and features
-- ============================================================================
SELECT CURRENT_ACCOUNT();
SELECT CURRENT_REGION();
SELECT CURRENT_VERSION();

-- Check if Cortex AI is enabled and working:
SELECT SNOWFLAKE.CORTEX.COMPLETE('mistral-large',
  [{'role': 'user', 'content': 'test'}]
) AS test_response;


-- 8. Check security integrations
-- ============================================================================
SHOW SECURITY INTEGRATIONS;


-- 9. Alternative: Create OAuth integration for REST API
-- ============================================================================
-- If keypair JWT doesn't work for REST API, you may need to use OAuth
-- This requires ACCOUNTADMIN role:

-- CREATE SECURITY INTEGRATION oauth_integration
--   TYPE = OAUTH
--   ENABLED = TRUE
--   OAUTH_CLIENT = CUSTOM
--   OAUTH_CLIENT_TYPE = 'CONFIDENTIAL'
--   OAUTH_REDIRECT_URI = 'https://your-app-url/oauth/callback'
--   OAUTH_ISSUE_REFRESH_TOKENS = TRUE
--   OAUTH_REFRESH_TOKEN_VALIDITY = 7776000;

-- After creating, get the client ID and secret:
-- DESC SECURITY INTEGRATION oauth_integration;


-- 10. Check if user has necessary privileges for REST API
-- ============================================================================
SHOW GRANTS ON ACCOUNT;

-- Expected privileges that might be needed:
-- - USAGE on WAREHOUSE
-- - USAGE on DATABASE
-- - USAGE on SCHEMA
-- - SELECT on tables
-- - EXECUTE MANAGED TASK (for Cortex AI)


-- ============================================================================
-- INSTRUCTIONS:
-- ============================================================================
-- 1. Copy this entire file
-- 2. Paste into your Snowflake SQL worksheet
-- 3. Run each section one by one
-- 4. Save the output from each query
-- 5. Check for any errors or unexpected values
--
-- Key things to look for:
-- - Does RSA_PUBLIC_KEY_FP match: SHA256:jGuUiDKHkUln0uqZ5u+DyCrrGPZ/gYuyfU59VhNt09U=
-- - Are there any network policies blocking REST API access?
-- - Does the user have all necessary grants?
-- - Does SnowSQL work with the same keypair?
-- - Is there an OAuth integration available?
-- ============================================================================
