# CuePoint Server - Deployment Guide for Hostinger VPS

## Prerequisites
- Hostinger VPS with Ubuntu 20.04+ or similar
- SSH access to your VPS
- Domain/subdomain pointed to your server IP

## Step 1: Build the Project Locally

First, build both the server and client on your local machine:

```bash
cd cuepoint-server

# Install dependencies
npm install
cd client && npm install && cd ..

# Build client (this creates dist/client folder)
cd client && npm run build && cd ..

# Build server (this creates dist/ folder)
npm run build
```

## Step 2: Create Production .env

Copy `.env.production` to `.env` and fill in your values:

```bash
cp .env.production .env
```

Required variables:
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_SERVICE_KEY` - Your Supabase service role key
- `ENCRYPTION_KEY` - Generate with: `openssl rand -hex 32`
- `PORT` - Server port (default: 3001)

## Step 3: Upload to Server

Option A - Using rsync:
```bash
rsync -avz --exclude='node_modules' --exclude='client/node_modules' \
  --exclude='dist/client' \
  -e ssh ./cuepoint-server user@your-server:/var/www/
```

Option B - Using SCP:
```bash
scp -r cuepoint-server.tar.gz user@your-server:/var/www/
ssh user@your-server "tar -xzf /var/www/cuepoint-server.tar.gz -C /var/www/"
```

## Step 4: Install on Server

SSH into your server and run:

```bash
cd /var/www/cuepoint-server

# Run deployment script
chmod +x deploy.sh
./deploy.sh

# Install PM2 globally (recommended)
npm install -g pm2

# Start with PM2
pm2 start ecosystem.config.js

# Setup PM2 startup script
pm2 startup
pm2 save
```

## Step 5: Configure Nginx (Reverse Proxy)

Install Nginx:
```bash
apt update && apt install nginx
```

Create Nginx config:
```bash
nano /etc/nginx/sites-available/cuepoint
```

Add this configuration:
```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable the site:
```bash
ln -s /etc/nginx/sites-available/cuepoint /etc/nginx/sites-enabled/
nginx -t
systemctl reload nginx
```

## Step 6: Setup SSL (Let's Encrypt)

```bash
apt install certbot python3-certbot-nginx
certbot --nginx -d your-domain.com
```

## Step 7: Firewall Setup

```bash
ufw allow 22    # SSH
ufw allow 80     # HTTP
ufw allow 443    # HTTPS
ufw enable
```

## Useful Commands

```bash
# View logs
pm2 logs cuepoint-server

# Restart server
pm2 restart cuepoint-server

# Check status
pm2 status

# Monitor in real-time
pm2 monit
```

## Troubleshooting

1. **Server won't start**: Check `.env` file exists and has correct values
2. **Database connection failed**: Verify SUPABASE_URL and SUPABASE_SERVICE_KEY
3. **Port already in use**: Change PORT in .env or stop other services
4. **502 Bad Gateway**: Check if PM2 is running and Nginx config is correct

## Project Structure on Server

```
/var/www/cuepoint-server/
├── dist/              # Compiled server code
│   ├── index.js
│   └── ...
├── dist/client/       # Management UI (static files)
├── uploads/           # User uploads
├── logs/              # Server logs
├── .env               # Environment variables
├── ecosystem.config.js
└── package.json
```
