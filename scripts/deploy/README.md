# Auto-deploy on push

Pushing `main` already builds and publishes to GHCR. This is the other half: the
host noticing.

It **polls**, because the host is behind a tunnel with no inbound route — which
is the normal shape for something people run at home. Nothing here needs a port
opened, a key in GitHub's secret store, or the Docker socket handed to a
third-party container.

## The part that is not obvious

**A restart interrupts every room in progress.** It used to end them: room
state was a `Map` that died with the process, so five phones mid-deck lost the
night. Since R149 rooms are snapshotted to `.cache` and come back, so a
replacement costs a reconnect — the phones show "hold on, your room will come
back", and it does.

That turned this script from a rescue into a courtesy, and it is kept as one. A
routine update does not need to interrupt five people mid-swipe when it can wait
twenty minutes. It just no longer needs to wait a day: the ceiling is six
hours, because a room's idle TTL is two and anything longer is stuck rather
than busy.

`docker compose pull && up -d` on a timer would eventually do that, and it would
do it on a Friday, because that is when rooms exist. So `autodeploy.sh` asks
`/healthz` how many rooms are live and defers while anybody is playing.

That is the whole reason this is a script and not a one-line cron entry.

## Before you install: a one-time volume migration

`docker-compose.yml` now pins the project and volume names (`jellyfin-matcher`,
`jellyfin-matcher-cache`). Compose previously derived both from the *directory*
the file sat in, so the volume was called something like `matcher_matcher-cache`
depending on where you put it.

**If you already have this running, that rename orphans your existing volume.**
Docker will create the new one empty, the old one keeps your data and nothing
references it, and the only symptom is a household that has forgotten what it
watched and a ratings cache re-fetching against a metered key. Nothing looks
broken, which is the whole problem.

Find the old one and copy it across before the first auto-deploy:

```bash
docker volume ls | grep matcher-cache          # find the existing name
# then, substituting it for OLD:
docker run --rm   -v OLD:/from -v jellyfin-matcher-cache:/to   alpine sh -c 'cp -a /from/. /to/'
docker volume ls | grep jellyfin-matcher-cache # confirm the new one exists
```

Keep the old volume until you have seen a deck build and a winner recorded. Then
remove it if you like — `docker volume rm OLD`.

## Install

```bash
# On the host, from the directory holding your docker-compose.yml
sudo mkdir -p /opt/jellyfin-matcher /var/lib/jellyfin-matcher

# The timer runs `docker compose` in MATCHER_COMPOSE_DIR as root, so the file it
# finds there decides what runs on your machine. Put it there deliberately and
# keep it root-owned; do not point the timer at a directory anybody else can
# write to.
sudo install -m 600 -o root -g root docker-compose.yml /opt/jellyfin-matcher/docker-compose.yml
sudo cp autodeploy.sh /usr/local/bin/matcher-autodeploy
sudo chmod +x /usr/local/bin/matcher-autodeploy

# Point it at your compose directory if it is not /opt/jellyfin-matcher
sudo tee /etc/default/jellyfin-matcher >/dev/null <<'EOF'
MATCHER_COMPOSE_DIR=/opt/jellyfin-matcher
MATCHER_HEALTH_URL=http://127.0.0.1:3000/healthz
EOF

sudo cp matcher-autodeploy.service matcher-autodeploy.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now matcher-autodeploy.timer
```

## Check it

```bash
systemctl list-timers matcher-autodeploy      # when it next runs
sudo systemctl start matcher-autodeploy       # run it now
journalctl -u matcher-autodeploy -n 30        # what it did and why
```

Expected lines: `already on the newest image, and healthy; nothing to do`, or
`N room(s) in progress -- deferring`, or `deploying sha256:…` then
`healthy on sha256:…`.

## If you would rather not

`sudo systemctl disable --now matcher-autodeploy.timer`, and go back to pulling
by hand. Nothing else depends on it.

## Pinning instead

Auto-deploy tracks whatever tag your compose file names. If that is `:latest`,
every push to `main` reaches your living room once the room is empty. That is
either the point or alarming, depending on the day.

To keep auto-deploy but only for versions you chose, point the compose file at a
release tag (`:v1.2.3`) and let the timer pick up rebuilds of that tag only —
or leave the timer off and deploy by `sha-<commit>` by hand, which is what
`docs/MAINTAINING.md` describes.

## What this does not do

- **No rollback.** If a bad image is published and deploys, the fix is to pin
  the previous `sha-` tag by hand. Automatic rollback would need a definition of
  "bad" that this app does not have — a container can be healthy and still be
  wrong.
- **No notification.** It writes to the journal and nothing else. If you want to
  hear about deploys, the journal is the thing to forward.
