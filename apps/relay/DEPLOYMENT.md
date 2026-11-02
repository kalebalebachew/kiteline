# Deploying the relay

The relay lets a phone reach its computer from anywhere: it joins the two and passes on sealed bytes
it can't read (see `packages/api/src/tunnel`). It runs at **https://relay.kiteline.seefun.dev**.

## Where it runs

- **Host:** a small VPS that also serves other production apps. Its `user@address` lives in
  `apps/relay/.deploy.env` as `VPS_HOST=…`, which is not committed: this repository is public.
- **Port:** `127.0.0.1:3880`, behind Caddy. Ports 3001–3700, 8080 and 9091–9100 were already taken on
  the host; 3880 was free.
- **Service:** `kiteline-relay`, a systemd unit running `/usr/bin/node relay.mjs` as its own
  no-login user, with `ProtectSystem=strict`, `MemoryMax=256M`, restarted on failure, started on boot.
  It uses about 60 MB.
- **Caddy:** one block appended to `/etc/caddy/Caddyfile`, which also routes the other apps:

  ```
  relay.kiteline.seefun.dev {
      encode gzip zstd
      reverse_proxy 127.0.0.1:3880
  }
  ```

  WebSockets pass through `reverse_proxy` as they are. Never rewrite that file: back it up, append,
  `caddy validate`, then `systemctl reload caddy` (reload keeps the other sites up; restart doesn't).

## DNS (Cloudflare)

One record, **DNS only (grey cloud)**: `A relay.kiteline → <the VPS's address>`.

A proxied record breaks Let's Encrypt for Caddy, and Cloudflare's proxy would sit inside the
WebSocket path. The zone has a proxied wildcard that covers this name until the explicit record
exists; the explicit record wins. Check with `dig +short relay.kiteline.seefun.dev A`: it must show
the VPS, not `104.21.*` or `172.67.*`.

## Layout on the host

```
/opt/kiteline-relay/
  releases/<git-rev>/   relay.mjs and web/, one per deploy (the last five are kept)
  current -> releases/<git-rev>
  shared/.env           PORT, HOST, RELAY_DATA (seeded once from apps/relay/.env.production)
  shared/data/app/      newer web app releases the relay fetched from npm
```

## Commands

```bash
pnpm deploy:relay       # build locally, upload, swap current, restart, health-check; rolls back on failure
pnpm deploy:relay-env   # push apps/relay/.env.production to shared/.env and restart (backs up the old one)
```

Both read `VPS_HOST` from `apps/relay/.deploy.env`. They prompt for the SSH password several times
unless a key is installed (`ssh-copy-id user@host` once). Nothing is ever built on the host.

## What it serves

Only the official web app, never anything a connected computer sends: the copy bundled at deploy
time, or a newer release from npm (`kiteline@latest`, checked against the registry's sha512) once one
is published. Publishing a new Kiteline version therefore updates the app on the relay by itself,
within 15 minutes or as soon as a computer on the new version connects. Changes to the relay's own
code (`apps/relay`, `packages/api/src/tunnel`) need `pnpm deploy:relay`.

## Rollback

```bash
ssh <host>
ls -1t /opt/kiteline-relay/releases/          # newest first
sudo ln -sfn /opt/kiteline-relay/releases/<previous> /opt/kiteline-relay/current
sudo systemctl restart kiteline-relay
curl -fsS http://127.0.0.1:3880/healthz
```

## Logs and health

```bash
sudo journalctl -u kiteline-relay -f     # starts, app updates; no addresses or contents
curl -fsS https://relay.kiteline.seefun.dev/healthz
```
