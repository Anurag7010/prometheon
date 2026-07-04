# Deploying Python Backend to Railway

## Prerequisites
- Railway account (railway.app)
- Railway CLI installed: `npm install -g @railway/cli`

## Steps

### 1. Login and initialize
```bash
railway login
cd ai-backend
railway init --name docmind-backend
```

### 2. Add a persistent volume for ChromaDB
In Railway dashboard → your service → Settings → Volumes:
- Mount path: `/app/chroma_db`
- Size: 1 GB (sufficient for development)

This is CRITICAL — without a volume, all ingested documents are lost on every deploy.

### 3. Set environment variables
```bash
railway variables set OPENAI_API_KEY=<your-openai-key>
railway variables set GROQ_API_KEY=<your-groq-key>
railway variables set TAVILY_API_KEY=<your-tavily-key>
railway variables set OWNER_EMAIL=rautanurag9@gmail.com
railway variables set MODEL_NAME=gpt-4o
railway variables set FAST_MODEL=gpt-4o-mini
railway variables set TEMPERATURE=0.0
railway variables set MAX_TOKENS=2000
railway variables set LOG_LEVEL=WARNING
railway variables set ENVIRONMENT=production
railway variables set INTERNAL_API_KEY=<generate: openssl rand -hex 32>
railway variables set RELEVANCE_THRESHOLD=0.65
railway variables set MAX_QUERY_CHARS=2000
```

NOTE: FRONTEND_URL will be set after Vercel deployment — come back to this.
Until FRONTEND_URL is set, the app will refuse to start in production mode
(this is intentional — `core/production_config.py` raises without it). For the
first deploy you can temporarily set `FRONTEND_URL=http://localhost:3000` and
replace it in step 7.

### 4. Deploy
```bash
railway up
```

### 5. Get production URL
```bash
railway domain
```
Save this URL — you need it for the Next.js deployment.
Example: `https://docmind-backend-production.up.railway.app`

### 6. Verify
```bash
curl https://<your-railway-url>/health | jq
```

### 7. After Vercel is deployed, set FRONTEND_URL
```bash
railway variables set FRONTEND_URL=https://<your-vercel-url>
railway up  # redeploy with CORS updated
```

## Notes

- **Single uvicorn worker**: ChromaDB is file-based and not safe for concurrent
  writes from multiple workers. Do not increase `--workers`.
- **SSE keep-alive**: the Dockerfile passes `--timeout-keep-alive 120` because
  Railway's default proxy timeout is 60s and LLM streaming responses can run longer.
- **HuggingFace model**: `all-MiniLM-L6-v2` is baked into the Docker image at
  build time — no runtime download on the free tier's first request.
- **Logs**: structured JSON goes to stdout — Railway captures it in the log
  dashboard. File logging to `logs/ai_backend.log` still works but is secondary.
