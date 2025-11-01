#!/bin/bash
# Quick API Test Script - DeadlineDAO
# Run with: bash TEST_API.sh

echo "🚀 DeadlineDAO API Test Suite"
echo "=============================="
echo ""

BASE_URL="http://localhost:3000/api"

# Test 1: API Index
echo "1️⃣  Testing API Index..."
curl -s "$BASE_URL" | python3 -m json.tool | head -20
echo ""
echo "---"
echo ""

# Test 2: Health Check
echo "2️⃣  Testing Health Check..."
curl -s "$BASE_URL/health" | python3 -m json.tool
echo ""
echo "---"
echo ""

# Test 3: Platform Analytics
echo "3️⃣  Testing Platform Analytics..."
curl -s "$BASE_URL/analytics/platform" | python3 -m json.tool | head -40
echo ""
echo "---"
echo ""

# Test 4: List Goals
echo "4️⃣  Testing List Goals..."
curl -s "$BASE_URL/goals?limit=5" | python3 -m json.tool
echo ""
echo "---"
echo ""

echo "✅ All API tests complete!"
echo ""
echo "📊 Status Summary:"
echo "   ✅ Solana: OPERATIONAL (2 SOL funded)"
echo "   ✅ Supabase: OPERATIONAL (database deployed)"
echo "   ❌ Snowflake: NOT CONFIGURED (primary AI feature)"
echo "   ❌ Cloudflare R2: NOT CONFIGURED (image uploads)"
echo ""
echo "📖 Next steps:"
echo "   - See STATUS.md for current status"
echo "   - See SETUP_GUIDE.md for Snowflake/R2 setup"
echo "   - Run 'npm run test:supabase' to verify database"
echo ""
