#!/bin/bash
# Generate RSA key pair for Snowflake JWT authentication
# Run with: bash scripts/generate-snowflake-keys.sh

echo "🔐 Generating Snowflake JWT Authentication Keys"
echo "=============================================="
echo ""

# Create keys directory
mkdir -p .snowflake-keys
cd .snowflake-keys

# Generate private key (encrypted with passphrase)
echo "1️⃣  Generating private key..."
openssl genrsa 2048 | openssl pkcs8 -topk8 -inform PEM -out rsa_key.p8 -nocrypt

if [ $? -eq 0 ]; then
    echo "✅ Private key generated: .snowflake-keys/rsa_key.p8"
else
    echo "❌ Failed to generate private key"
    exit 1
fi

echo ""

# Generate public key
echo "2️⃣  Generating public key..."
openssl rsa -in rsa_key.p8 -pubout -out rsa_key.pub

if [ $? -eq 0 ]; then
    echo "✅ Public key generated: .snowflake-keys/rsa_key.pub"
else
    echo "❌ Failed to generate public key"
    exit 1
fi

echo ""
echo "=============================================="
echo "✅ Key pair generated successfully!"
echo ""
echo "📋 Next steps:"
echo ""
echo "1. Log into your Snowflake account"
echo "2. Run this SQL command to add the public key to your user:"
echo ""
echo "   ALTER USER <your_username> SET RSA_PUBLIC_KEY='"
cat rsa_key.pub | grep -v "BEGIN PUBLIC KEY" | grep -v "END PUBLIC KEY" | tr -d '\n'
echo "';"
echo ""
echo "3. Copy the public key above (without the BEGIN/END lines)"
echo "4. Paste it into Snowflake SQL worksheet and execute"
echo ""
echo "🔑 Your private key is stored in:"
echo "   $(pwd)/rsa_key.p8"
echo ""
echo "⚠️  KEEP THIS PRIVATE KEY SECRET!"
echo ""
