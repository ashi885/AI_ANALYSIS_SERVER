# CuePoint Server - Hostinger Node.js Web Hosting Deployment

## Step 1: Build Locally

Run these commands on your local machine:

```bash
cd cuepoint-server

# Build server
npm run build

# Build client
cd client && npm run build && cd ..
```

## Step 2: Prepare Files for Upload

1. Zip the `dist` folder:
```bash
cd cuepoint-server
zip -r cuepoint-deploy.zip dist
```

2. Upload `cuepoint-deploy.zip` to Hostinger using File Manager or FTP

3. Extract in Hostinger File Manager

## Step 3: Setup on Hostinger

### Option A: Using hPanel Node.js Section

1. Go to **Hosting** → **Node.js** in hPanel
2. Click **Create Application**
3. Set:
   - **Application root**: `public_html/cuepoint/dist` (or wherever you extracted)
   - **Application startup file**: `index.js`
   - **Node.js version**: 18 or 20
4. Click **Install Dependencies** - it will run `npm install --production`
5. Set **Environment Variables** in the Node.js settings:
   - `SUPABASE_URL` = your Supabase URL
   - `SUPABASE_SERVICE_KEY` = your service role key
   - `ENCRYPTION_KEY` = generate with https://pwgen.io (32 chars)
   - `PORT` = 3001

6. Click **Restart** to apply

### Option B: Manual Setup via SSH/Terminal

1. Open Terminal in hPanel
2. Navigate to your app folder:
```bash
cd public_html/cuepoint/dist
```

3. Install dependencies:
```bash
npm install --production
```

4. Set environment variables:
```bash
export SUPABASE_URL="your-supabase-url"
export SUPABASE_SERVICE_KEY="your-service-key"
export ENCRYPTION_KEY="your-32-char-key"
export PORT=3001
```

5. Start the app (if supported):
```bash
node dist/index.js
```

## Step 4: Configure Domain

In hPanel → **Node.js** → **Custom Domain**:
- Add your domain/subdomain
- Point to the application root

## Step 5: Important Notes

### Port Issue
Hostinger shared hosting often restricts direct port usage. If PORT 3001 doesn't work:
- Try PORT 3000 or leave it empty (let Hostinger assign)
- Or use their built-in port configuration

### Database
Your Supabase connection will work as long as:
- `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` are set correctly
- Outbound connections to `*.supabase.co` are allowed

### Uploads Folder
Create a `uploads` folder if your app needs file uploads:
```bash
mkdir -p public_html/cuepoint/dist/uploads
chmod 755 public_html/cuepoint/dist/uploads
```

## Troubleshooting

1. **App won't start**: Check Node.js version is 18+
2. **Database errors**: Verify SUPABASE credentials
3. **Static files not loading**: Ensure `dist/client` folder exists and is accessible
4. **CORS errors**: The app already has `origin: '*'` configured

## Environment Variables to Set

| Variable | Value |
|----------|-------|
| SUPABASE_URL | `https://xxxx.supabase.co` |
| SUPABASE_SERVICE_KEY | Your service role key |
| ENCRYPTION_KEY | 32 character hex string |
| PORT | 3001 (or leave empty) |
