#!/bin/bash

# CuePoint Server - Prepare Deployment Package
# Run this locally before uploading to server

set -e

echo "=== Preparing CuePoint Server for Deployment ==="

cd "$(dirname "$0")"

# Clean previous builds
rm -rf dist/client
rm -rf dist/node_modules

# Build server
echo "Building server..."
npm run build

# Build client
echo "Building client..."
cd client && npm run build && cd ..

# Create uploads directory structure
mkdir -p dist/uploads
mkdir -p dist/logs

# Copy essential files
cp .env.production dist/.env.example
cp ecosystem.config.js dist/
cp package.json dist/

# Create a summary
echo ""
echo "=== Build Complete ==="
echo "Files in dist/:"
ls -la dist/
echo ""
echo "Client assets:"
ls -la dist/client/assets/ 2>/dev/null || echo "No client assets"
echo ""
echo "Next steps:"
echo "1. Upload 'dist' folder to your Hostinger VPS"
echo "2. Run 'npm install --production' on the server"
echo "3. Configure .env with your actual credentials"
echo "4. Start with PM2: pm2 start ecosystem.config.js"
