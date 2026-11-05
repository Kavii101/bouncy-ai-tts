# Deploying the Interview Copilot

Runs beside other production stacks on a shared 2-core box. Everything below is
additive: it creates new things and changes nothing that already exists.

## Rules that are easy to break

- **Never `docker login ghcr.io` on the box.** It holds a login another project's
  auto-deploy depends on. The image arrives as a tar instead.
- **Never rely on an unused image for rollback.** `/etc/cron.d/docker-image-prune`
  runs `docker image prune -af --filter until=24h` nightly. Keep tars in
  `/opt/interview-copilot/images/`; that directory is the rollback store.
- **Never `docker build` on the box**, and never run `docker system prune`,
  `docker compose down -v`, or an unscoped compose command. Always pass
  `-p interview-copilot`.
- `certbot certonly --webroot` only. `certbot --nginx` as an installer rewrites vhosts.

## Coordinates

| Thing | Value |
|---|---|
| Directory | `/opt/interview-copilot/` (`docker-compose.yml`, `.env` mode 600, `images/`) |
| Compose project / network | `interview-copilot` / `interview-copilot-net` |
| Container / volume | `interview-copilot-web` / `interview-copilot-data` (`/data/app.db`) |
| Host port | `127.0.0.1:3020` |
| nginx | `/etc/nginx/sites-available/interview-copilot`, `/etc/nginx/interview-copilot.htpasswd` |

## Deploy a new version

CI uploads an `image-<sha>` artifact on every push.

```bash
# On the Mac
gh run download <run-id> -n image-<sha> -D /tmp/ic
scp /tmp/ic/image.tar.gz root@<box>:/opt/interview-copilot/images/<sha>.tar.gz

# On the box
cd /opt/interview-copilot
gunzip -c images/<sha>.tar.gz | docker load
sed -i 's|^IMAGE=.*|IMAGE=ghcr.io/kavii101/interview-copilot:<sha>|' .env
docker compose -p interview-copilot up -d web
```

Migrations run at startup (`MIGRATE_ON_BOOT`). If they fail the container exits
and restarts visibly rather than serving a schema-less app.

## Roll back

Load the previous tar from `images/`, set `IMAGE` back to its sha, and `up -d web`.
To cut access immediately: `docker compose -p interview-copilot stop web`.

## Add the real domain

1. Create an A record for `interview.bountyai.online` pointing at the box.
2. `certbot certonly --webroot -w /var/www/html -d interview.bountyai.online --deploy-hook "systemctl reload nginx"`
3. Point `server_name` and the two `ssl_certificate*` lines at the new name, `nginx -t`, `systemctl reload nginx`.
