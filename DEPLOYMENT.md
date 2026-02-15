# Railway Deployment Guide

Your OddsSync Backend is **ready to deploy** to Railway. Here's how to push and deploy:

## Current Status

✅ **6 commits on `refactor` branch**
✅ **73 tests passing (100%)**
✅ **Production API server built**
✅ **Railway configs in place**
✅ **Entity aliases loaded (100+ teams)**

```
* 83d60bd feat: Add production API server with Railway deployment
* bfe4bec docs: Add comprehensive documentation and integration guide
* b6986a9 feat: Add validation rig for garbage match testing
* 2bfd937 feat: Implement WaterfallFilter deterministic matching
* 5fea17a feat: Implement MarketNormalizer with parlay rejection
* 5381950 feat: Implement core type system for entity resolution
```

## Option 1: Deploy via GitHub (Recommended)

Railway works best with GitHub integration.

### Step 1: Create GitHub Repository

```bash
# Create a new repo on GitHub (github.com/new)
# Name it: oddssync-backend
# Do NOT initialize with README

# Then add the remote:
git remote add origin https://github.com/YOUR_USERNAME/oddssync-backend.git
```

### Step 2: Push to GitHub

```bash
git push -u origin refactor
```

### Step 3: Connect Railway to GitHub

1. Go to Railway dashboard: https://railway.app/project/cd2b52cc-0f9f-4c16-a6f9-105426bc6d11
2. Click on `oddssync-backend` service
3. Settings → Source → Connect Repository
4. Select `YOUR_USERNAME/oddssync-backend`
5. Set branch to `refactor`
6. Click "Deploy Now"

Railway will:
- Detect `railway.json` configuration
- Run `npm install && npm run build`
- Start server with `node dist/server.js`
- Deploy to: `oddssync-backend-production.up.railway.app`

## Option 2: Deploy via Railway CLI

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Link to existing project
railway link cd2b52cc-0f9f-4c16-a6f9-105426bc6d11

# Deploy
railway up
```

## Option 3: Direct Git Push (Railway Git Remote)

Railway can provide a git remote URL:

1. Go to Railway dashboard
2. Settings → Generate Deploy Token
3. Copy the git URL (format: `git@github.com:railway/...`)
4. Add remote and push:

```bash
git remote add railway YOUR_RAILWAY_GIT_URL
git push railway refactor:main
```

---

## After Deployment

### 1. Verify Health Check

```bash
curl https://oddssync-backend-production.up.railway.app/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2024-02-15T...",
  "uptime": 123.45,
  "environment": "production"
}
```

### 2. Test API Endpoints

```bash
# Get configuration
curl https://oddssync-backend-production.up.railway.app/api/config

# Test single match
curl -X POST https://oddssync-backend-production.up.railway.app/api/match \
  -H "Content-Type: application/json" \
  -d '{
    "polymarket": {
      "id": "pm_test",
      "title": "Texas vs Oklahoma - Winner",
      "commence_time": 1700000000
    },
    "kalshi": {
      "ticker": "kx_test",
      "title": "Texas vs Oklahoma - To Win",
      "expiration_time": 1700000000
    }
  }'
```

### 3. Monitor Logs

```bash
# Via Railway CLI
railway logs

# Or check Railway dashboard
# → Service → Logs tab
```

### 4. Update Frontend

Update your frontend to point to the new backend URL:

```javascript
const BACKEND_URL = "https://oddssync-backend-production.up.railway.app";
```

---

## Environment Variables (Optional)

If you need to configure thresholds:

```bash
# Via Railway dashboard: Settings → Variables
PORT=8080  # Default
NODE_ENV=production  # Default
TEMPORAL_THRESHOLD=3600  # Optional: override default
LINE_TOLERANCE=0.5  # Optional: override default
```

---

## Rollback Plan

If you need to rollback:

```bash
# Via Railway dashboard
# → Deployments → Select previous deployment → Redeploy

# Or revert git
git revert 83d60bd
git push origin refactor
```

---

## Performance Monitoring

Railway provides metrics at:
- CPU usage
- Memory usage
- Response times
- HTTP request count

Expected performance:
- Health check: ~5ms
- Single match: ~10-20ms
- Batch match (100x100): ~500ms-1s

---

## Troubleshooting

### Build fails
Check Railway logs for TypeScript errors:
```bash
railway logs --filter build
```

### Port issues
Railway automatically sets `PORT` env var. Server listens on `0.0.0.0:$PORT`.

### Health check fails
Verify `/health` endpoint returns 200:
```bash
curl -I https://oddssync-backend-production.up.railway.app/health
```

---

## What Happens on Deploy

1. **Build Phase** (railway.json):
   - `npm install`
   - `npm run build` → TypeScript → `dist/`

2. **Deploy Phase**:
   - Start: `node dist/server.js`
   - Health check: `/health` every 30s
   - Port: Railway-assigned (8080 default)

3. **Auto-scaling**:
   - Railway scales based on CPU/memory usage
   - Graceful shutdown on SIGTERM

---

## Next Steps After Deployment

1. ✅ Deploy backend (you're here)
2. 📱 Update frontend API URL
3. 🧪 Test end-to-end arbitrage detection
4. 📊 Monitor rejection rates in logs
5. 🔧 Tune thresholds based on production data
6. 📈 Add metrics/telemetry (optional)

---

**Ready to deploy!** Choose Option 1 (GitHub) for the smoothest experience.
