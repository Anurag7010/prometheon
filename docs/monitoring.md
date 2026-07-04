# Production Monitoring

## UptimeRobot (free tier — 50 monitors, 5 min interval)

### Setup
1. Create account at uptimerobot.com
2. Add two monitors:

**Monitor 1 — Python Backend**
- Type: HTTP(s)
- URL: `https://<railway-url>/health`
- Interval: 5 minutes
- Alert: Email on downtime

**Monitor 2 — Next.js Frontend**
- Type: HTTP(s)
- URL: `https://<vercel-url>`
- Interval: 5 minutes
- Alert: Email on downtime

### What the health endpoint reports
```json
{
  "status": "ok",
  "components": { "llm": "ok", "rag": "ok", "logger": "ok" },
  "cache": { ... },
  "queue": { "max_concurrent": 10, "currently_queued": 0 },
  "rate_limiter": { "tracked_users": 0 },
  "system": { "memory_mb": 250.0, "memory_warning": false }
}
```

If `status` is not `"ok"` or HTTP is not 200, UptimeRobot alerts.

### Railway-specific notes
- Railway free tier sleeps after 30 min of inactivity
- First request after sleep takes ~15s (cold start + model loading)
- UptimeRobot's 5-min pings keep the service warm
- If using Railway's free tier (not Pro), expect occasional cold starts
