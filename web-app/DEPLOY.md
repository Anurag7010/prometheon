# Deploying Next.js Frontend to Vercel

## Prerequisites
- Vercel account (vercel.com)
- Vercel CLI installed: `npm install -g vercel`
- Supabase account for production PostgreSQL
- Railway backend already deployed with its URL (see `ai-backend/DEPLOY.md`)

## Step 1 — Create Supabase Database

1. Go to supabase.com → New Project
2. Name: `docmind-prod`
3. Region: closest to your Railway backend
4. Copy the connection string from:
   Settings → Database → Connection string → URI
   Format: `postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres`

## Step 2 — Run Migrations Against Production DB

```bash
cd web-app
DATABASE_URL="<your-supabase-connection-string>" npx drizzle-kit push
```

Verify:
```bash
psql "<your-supabase-connection-string>" -c "\dt"
# Expected: users, documents, queries, conversations, messages, search_history
```

## Step 3 — Deploy to Vercel

```bash
cd web-app
vercel login
vercel
```

Follow the prompts:
- Link to existing project or create new
- Framework: Next.js (auto-detected)
- Root directory: `./` (within web-app)

## Step 4 — Set Environment Variables

In Vercel dashboard → Settings → Environment Variables, add ALL of these for Production:

| Variable | Value |
|----------|-------|
| `DATABASE_URL` | Your Supabase connection string |
| `JWT_SECRET` | Generate: `openssl rand -base64 32` |
| `JWT_REFRESH_SECRET` | Generate: `openssl rand -base64 32` (different from JWT_SECRET) |
| `NEXT_PUBLIC_AI_BACKEND_URL` | Your Railway backend URL (e.g. `https://docmind-backend-xxx.up.railway.app`) |
| `AI_BACKEND_URL` | Same as above (server-side usage) |
| `AI_BACKEND_API_KEY` | The INTERNAL_API_KEY you set on Railway |
| `NEXT_PUBLIC_APP_URL` | Your Vercel URL (e.g. `https://docmind.vercel.app`) |
| `LOG_LEVEL` | `warn` |

## Step 5 — Redeploy with Environment Variables

```bash
vercel --prod
```

## Step 6 — Update Railway CORS

Now that you have the Vercel URL:
```bash
cd ai-backend
railway variables set FRONTEND_URL=https://<your-vercel-url>
railway up
```

## Step 7 — Register Owner Account

```bash
curl -X POST https://<your-vercel-url>/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"rautanurag9@gmail.com","password":"<strong-password>"}'
```

This account gets OpenAI GPT-4o. All other registrations get Groq free tier.

## Step 8 — Run the Production Smoke Test

```bash
./scripts/production-smoke-test.sh https://<your-vercel-url> https://<your-railway-url>
```
