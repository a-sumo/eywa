#!/bin/bash
# Eywa Setup Script

set -e

echo "=== Eywa Setup ==="
echo

# Check Python
if ! command -v python3 &> /dev/null; then
    echo "Error: Python 3 is required"
    exit 1
fi

# Install dependencies
echo "Installing Python dependencies..."
pip install -r requirements.txt

# Check for .env
if [ ! -f .env ]; then
    echo
    echo "Creating .env file..."
    echo "Enter your Supabase Project URL:"
    read -r SUPABASE_URL
    echo "Enter your Supabase anon/public key:"
    read -r SUPABASE_KEY

    echo "SUPABASE_URL=$SUPABASE_URL" > .env
    echo "SUPABASE_KEY=$SUPABASE_KEY" >> .env
    echo ".env created"
else
    echo ".env already exists"
fi

echo
echo "=== Setup Complete ==="
echo
echo "Next steps:"
echo "1. Run schema.sql in your Supabase SQL Editor"
echo "2. Add to Claude Code:"
echo "   claude mcp add eywa -- python $(pwd)/eywa_mcp.py"
echo
