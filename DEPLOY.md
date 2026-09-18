# Deploy

Production is **https://catan.endea.ar**, one Docker container on a VPS behind Caddy.
Nothing auto-deploys — a push does not ship. You run `deploy.sh`.

## Run it locally

```bash
npm i        # Node v20.10 (.nvmrc); v18+ works
npm start    # nodemon, http://localhost:3000
npm test     # node --test tests/
```

`npm start` and `npm run dev` are the same command. There is no build step: `public/` is served
as-is by `express.static` and `views/` is rendered by Mustache at request time.

To play on your LAN, hit `http://<your-ip>:3000` from the other devices — the client opens its
socket against whatever host it loaded from, so no config changes.

## Environment

| Var | Default | Effect |
|---|---|---|
| `PORT` | `3000` | HTTP + Socket.IO listen port (`index.js:320-322`). |
| `API_SALT` | *unset* | Gates `/api/sessions` and `/api/sessions/clear/:id`. **Unset means every call returns `401`** — that is the safe default; only set it if you want the admin endpoints. |

In production `API_SALT` lives in `/opt/endea/catan.env` on the VPS. It is not in the repo.

## Docker

The `Dockerfile` is `node:20-alpine`, `npm ci --omit=dev`, copies `index.js models views public`,
runs as the `node` user, `CMD ["node", "index.js"]` on `:3000`. No dev dependencies, no nodemon.

```bash
docker build -t catan .
docker run --rm -p 3000:3000 -e API_SALT=whatever catan
```

## Production

Topology: Cloudflare (proxied, SSL mode Full) → Caddy on the VPS → container on `127.0.0.1:8082`.

The VPS keeps every service in `/opt/endea`:

- `docker-compose.yml` — the `catan` service builds from `repos/catanFullEndea`.
- `catan.env` — `API_SALT`.
- `deploy.sh catan` — git pull, rebuild the image, restart the service.

Deploy from your Mac:

```bash
vps deploy catan     # pull + rebuild + restart
vps-logs catan
vps-restart catan
vps-sh catan
```

**A deploy ends every game in progress.** All state is in the Node process (`GAME_SESSIONS`),
so restarting wipes it; players get bounced to `/login` with their game key prefilled. Check
`vps-logs catan` for live rooms before shipping.

## Map editor on GitHub Pages

`npm run deploy-shuffler` (`deploy-gh-pages.sh`) pushes a standalone copy of `map-editor.html`
to `gh-pages`. That is the only other deploy target, and it ships the editor only — no server,
no multiplayer.
