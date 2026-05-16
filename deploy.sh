#!/bin/bash

# CuePoint Server Deployment Script
# Run this on your Hostinger VPS after uploading the code

set -e

echo "=== CuePoint Server Deployment ==="
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "Node.js not found. Installing Node.js 20..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
fi

echo "Node version: $(node -v)"
echo "npm version: $(npm -v)"
echo ""

# Navigate to app directory
cd /var/www/cuepoint-server

# Install dependencies
echo "Installing dependencies..."
npm install --production

# Create uploads directory
mkdir -p uploads
chmod 755 uploads

# Create log directory
mkdir -p logs

# Check if .env exists
if [ ! -f .env ]; then
    echo "WARNING: .env file not found!"
    echo "Please create .env file with required variables:"
    echo "  - SUPABASE_URL"
    echo "  - SUPABASE_SERVICE_KEY"
    echo "  - ENCRYPTION_KEY"
    echo "  - PORT"
    exit 1
fi

echo ""
echo "=== Deployment Complete ==="
echo "Run 'npm start' or use PM2 to start the server"
