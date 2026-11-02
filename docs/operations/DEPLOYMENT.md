# Deployment

**Status: PREPARED, NOT DEPLOYED (D-025).** Nothing below has been done. Every step that creates an account, costs money or deploys needs Dan's approval first.

## Shape (option B)

```
browser ──► Vercel (oruno site)          static website from web/dist
               │  /v1/*  rewrite
               ▼
            API host (one container)      Fastify API + background jobs (Dockerfile)
               │
               ▼
            Managed Postgres              backups + point-in-time recovery
```

- The browser only talks to the Vercel origin. `/v1/*` is forwarded to the API, so the session cookie is first-party and the CSP stays `connect-src 'self'`.
- **One API instance only.** Rate limits are in memory and pg-boss schedules jobs once; a second instance needs a decision first.

## To decide and approve (T-706)

| Item | Options | Status |
| --- | --- | --- |
| API host | Railway, Fly.io or Render (any host that runs a Dockerfile always-on with a pre-deploy command) | OPEN |
| Managed Postgres 16 | The host's own Postgres, or Neon/Supabase | OPEN; needs daily backups and point-in-time recovery |
| Vercel plan | Hobby or Pro (check current Vercel terms for commercial use) | OPEN |
| Domain | e.g. oruno.xyz (T-012) | OPEN |
| Spending | All of the above | **Needs Dan's approval** |

## One-time setup (staging first, then production)

1. **Postgres:** create the database; note the connection string (use TLS, e.g. `?sslmode=require`).
2. **API host:** create a service from this repository's `Dockerfile`.
   - **Pre-deploy / release command:** `node dist/db/migrate-cli.js` (the server refuses to start while migrations are pending).
   - **Health check:** `GET /health`.
   - **Instances:** exactly 1.
   - Environment: see below.
3. **GitHub OAuth App** (T-209), one per environment:
   - Homepage URL: `https://<site>`
   - Callback URL: `https://<site>/v1/auth/github/callback` (the **Vercel** origin, not the API host — the cookie must be set on the site).
4. **Vercel:** import the repository (root directory = repo root). `vercel.json` sets the build, output, rewrites and headers.
   - Replace `https://oruno-api.invalid` in `vercel.json` with the API host's URL, in a reviewed PR. (`.invalid` never resolves, so an unconfigured deploy fails closed.)
5. **Operator key:** run `node dist/cli/create-operator.js "<name>"` once in an **interactive shell** on the API host (not a logged one-off job: the key is printed once and would land in the host's logs). Store it in a password manager.
6. **Monitoring:** `/health` isn't under `/v1`, so it isn't reachable through the Vercel site. Check the API host's `/health` directly and alert on failure. Alert on the log lines `LEDGER INVARIANT VIOLATION` and `claim.overshoot` audit events (see `RUNBOOK.md`).

## API environment

| Variable | Staging | Production | Notes |
| --- | --- | --- | --- |
| `NODE_ENV` | `production` | `production` | Set by the Dockerfile. Enables `__Host-` Secure cookies and HSTS |
| `DATABASE_URL` | secret | secret | |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` / `GITHUB_CALLBACK_URL` | staging app | production app | Secret: client secret |
| `PROVIDER` | `none` until Phase 4b | `surplus` | `fake` is refused in production |
| `SURPLUS_ADMIN_KEY` / `SURPLUS_WORKSPACE_ID` | — | secret | Phase 4b |
| `TRUST_PROXY` | `2` (to verify) | same | Vercel + the host's load balancer. **Verify on staging** that rate limits see the real client IP (see below) |
| `LOG_LEVEL` | `info` | `info` | |
| `HOST` / `PORT` | `0.0.0.0` / `3000` | same | Set by the Dockerfile; most hosts inject `PORT` |

Secrets live only in the host's secret store. Never in the repository, never in logs.

## Staging checks (closes T-609 / T-707)

- [ ] `/health` on the API host returns ok; the release step ran migrations.
- [ ] Website loads on the Vercel URL with the CSP and HSTS headers.
- [ ] GitHub sign-in round trip lands back on the pool page with a `__Host-oruno_session` cookie (HttpOnly, Secure, SameSite=Lax).
- [ ] **Client IP:** from two different networks, sign-in rate limits count separately; a forged `X-Forwarded-For` doesn't bypass them. Adjust `TRUST_PROXY` until both hold.
- [ ] Claim on a test pool (provider `none` → expect `503 provider_not_configured`; with Surplus in 4b → full claim and key in Claude Code).
- [ ] Restart the API container: jobs resume; ledger check clean.
- [ ] Restore a database backup into a scratch database.

## Rollback

- **Website:** promote the previous Vercel deployment.
- **API:** redeploy the previous image. Migrations are forward-only in production (rollback is refused); a release that needs a schema change must stay compatible with the previous code for one release.
