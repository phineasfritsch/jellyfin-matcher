#!/usr/bin/env bash
#
# R147: pull a new image and restart -- but never while a room is live.
#
# Pushing main already builds and publishes to GHCR. What it does not do is
# reach the host, because the host is behind a tunnel with no inbound route,
# which is the normal shape for a thing people run at home. So the host polls.
#
# The part that matters is the refusal, though R149 changed what it is worth.
#
# Room state used to be a Map that died with the process: a replacement ended
# every room in progress and five phones mid-deck simply lost the night. Rooms
# are snapshotted now, so a restart costs an INTERRUPTION rather than an
# evening -- the phones show "hold on", reconnect, and rejoin where they were.
#
# So this is a courtesy, not a rescue, and it is worth keeping as one: a routine
# update does not need to interrupt five people mid-swipe when it can wait
# twenty minutes. What it no longer needs to be is stubborn, which is why the
# ceiling below is hours rather than a day.
#
# Deliberately NOT used here:
#   - Watchtower, or anything wanting the Docker socket. A container with the
#     socket is root on the host, and this app already holds an admin Jellyfin
#     key; adding a second thing with that reach to save a shell script is a bad
#     trade (docs/TRUST.md).
#   - A GitHub Actions SSH deploy. It needs an inbound route and a host key in
#     somebody else's secret store, to solve what a poll solves with neither.
#
# Install: see scripts/deploy/README.md
set -euo pipefail

COMPOSE_DIR="${MATCHER_COMPOSE_DIR:-/opt/jellyfin-matcher}"
HEALTH_URL="${MATCHER_HEALTH_URL:-http://127.0.0.1:3000/healthz}"
SERVICE="${MATCHER_SERVICE:-jellyfin-matcher}"
# How long a busy host may defer before it gives up waiting and deploys anyway.
#
# A real ceiling, not a warning: a room can be held open by anybody who can
# reach the app, and an update that waits for ever is a security patch that
# never lands. Six hours because a room's idle TTL is two -- a genuinely live
# night cannot last this long, so reaching the ceiling means something is stuck
# rather than that somebody is still watching. It was 24 when a deploy cost the
# evening; since R149 it costs a reconnect.
MAX_DEFER_HOURS="${MATCHER_MAX_DEFER_HOURS:-6}"
STATE_DIR="${MATCHER_STATE_DIR:-/var/lib/jellyfin-matcher}"
LOCK="${STATE_DIR}/autodeploy.lock"
FIRST_DEFERRED="${STATE_DIR}/first-deferred"

log() { printf '%s autodeploy: %s\n' "$(date -Is)" "$*"; }

mkdir -p "$STATE_DIR"
chmod 700 "$STATE_DIR" 2>/dev/null || true

# One at a time. Two overlapping runs can recreate the container twice and race
# each other's health check. Distinguish "someone else holds it" from "flock is
# missing or the fd is broken" -- reporting the second as the first is how a
# permanently failing timer looks like a busy one.
exec 9>"$LOCK"
set +e
flock -n 9
lock_rc=$?
set -e
if [ "$lock_rc" -eq 1 ]; then
  log "another run holds the lock; nothing to do"
  exit 0
elif [ "$lock_rc" -ne 0 ]; then
  log "ERROR: flock failed with status $lock_rc (is util-linux installed?)"
  exit 1
fi

cd "$COMPOSE_DIR"

# --- what is running now ----------------------------------------------------
#
# `docker compose images -q` reports the image of the CREATED CONTAINER, not
# what the tag resolves to. Comparing it either side of a pull compares the
# container to itself, so it never changes and the script would exit "already on
# the newest image" for ever -- silently, because that is the line the README
# documents as normal. This is the container's image id, asked for directly.
cid="$(docker compose ps -aq "$SERVICE" 2>/dev/null || true)"
running=""
if [ -n "$cid" ]; then
  running="$(docker inspect -f '{{.Image}}' "$cid" 2>/dev/null || true)"
fi

if [ -z "$cid" ]; then
  # No container at all. Somebody removed it, or this is a half-finished
  # install. Creating one would start a service a person deliberately stopped,
  # possibly mid-maintenance, so this reports and stops.
  log "no $SERVICE container exists; not creating one. Run 'docker compose up -d' yourself if that is wrong."
  exit 0
fi

if ! docker compose pull --quiet "$SERVICE"; then
  log "pull failed; leaving the running container alone"
  exit 1
fi

# --- what the tag now points at ---------------------------------------------
image_ref="$(docker compose config --images "$SERVICE" 2>/dev/null | head -n1 || true)"
target=""
if [ -n "$image_ref" ]; then
  target="$(docker image inspect -f '{{.Id}}' "$image_ref" 2>/dev/null || true)"
fi
if [ -z "$target" ]; then
  log "ERROR: could not resolve the image for $SERVICE (compose too old, or no such image locally)"
  exit 1
fi

state="$(docker inspect -f '{{.State.Running}}' "$cid" 2>/dev/null || echo false)"

if [ "$running" = "$target" ]; then
  # Current. But "current" is not "working": a deploy whose health check failed
  # leaves a stopped-or-sick container on the newest image, and reporting
  # success every ten minutes afterwards would hide it for ever.
  if [ "$state" != "true" ]; then
    log "ERROR: on the newest image but the container is not running. docker compose logs --tail=50 $SERVICE"
    exit 1
  fi
  if ! curl -fsS --max-time 10 "$HEALTH_URL" >/dev/null 2>&1; then
    log "ERROR: on the newest image but /healthz does not answer. docker compose logs --tail=50 $SERVICE"
    exit 1
  fi
  log "already on the newest image, and healthy; nothing to do"
  rm -f "$FIRST_DEFERRED"
  exit 0
fi

# --- something new to deploy: is anybody playing? ---------------------------
#
# "Not running" and "did not answer" are different, and only the first is safe
# to deploy over. A stopped container is hosting nobody. A running one that
# times out may be mid-deck with five phones on it -- treating that as "empty"
# would do the exact thing this script exists to prevent.
if [ "$state" != "true" ]; then
  log "container is not running; deploying $target"
else
  body="$(curl -fsS --max-time 10 "$HEALTH_URL" 2>/dev/null || true)"
  rooms=""
  # Require the payload to actually be this app's. A proxy error page, a login
  # portal, or anything else answering 200 on that URL must not be read as
  # "nobody is playing".
  case "$body" in
    *'"ok":true'*|*'"ok": true'*)
      # R161: prefer the count of rooms somebody is CONNECTED to. `rooms` counts
      # Map entries, so after a restart every restored room reads as busy until
      # people come back -- which is the state this script meets after every
      # deploy it performs, and it would then defer the next one for nobody.
      #
      # Falling back to `rooms` is what makes this safe to roll out. This script
      # is updated by hand on the host and the container updates itself, so the
      # two are routinely different ages. A version REQUIRING activeRooms would
      # read nothing from an older container and refuse -- and refusing is what
      # stops the container being replaced, so the deploy that fixes it is the
      # one the change prevents.
      rooms="$(printf '%s' "$body" | sed -n 's/.*"activeRooms"[[:space:]]*:[[:space:]]*\([0-9]\{1,\}\).*/\1/p')"
      if [ -z "$rooms" ]; then
        rooms="$(printf '%s' "$body" | sed -n 's/.*"rooms"[[:space:]]*:[[:space:]]*\([0-9]\{1,\}\).*/\1/p')"
      fi
      ;;
  esac

  if [ -z "$rooms" ]; then
    log "REFUSING: the app is running but /healthz gave no usable room count."
    log "REFUSING: deploying now could interrupt a night in progress. Check the app, or deploy by hand."
    exit 0
  fi

  if [ "$rooms" -gt 0 ]; then
    now="$(date +%s)"
    first="$(cat "$FIRST_DEFERRED" 2>/dev/null || true)"
    case "$first" in
      ''|*[!0-9]*)
        # Missing, empty, or corrupt -- an interrupted write leaves a zero-byte
        # file, and using that in arithmetic aborts the run with a bare bash
        # error and no log line at all.
        first="$now"
        printf '%s' "$now" > "${FIRST_DEFERRED}.tmp" && mv "${FIRST_DEFERRED}.tmp" "$FIRST_DEFERRED"
        ;;
    esac
    waited_h=$(( (now - first) / 3600 ))

    if [ "$waited_h" -ge "$MAX_DEFER_HOURS" ]; then
      log "WARNING: $rooms room(s) live, but an update has waited ${waited_h}h. Deploying anyway."
      log "WARNING: a room has an idle TTL, so this usually means one is stuck or somebody is holding it open."
    else
      log "$rooms room(s) in progress -- deferring (${waited_h}h so far). A restart interrupts every live room."
      exit 0
    fi
  fi
fi

# --- replace the container --------------------------------------------------
#
# `up -d` and nothing else: `down -v` would delete the named volume holding the
# ratings cache and the watch history, so the household would forget what it had
# watched and re-fetch every rating against a metered key (R109, R143).
log "deploying $target"
if ! docker compose up -d "$SERVICE"; then
  log "ERROR: 'up -d' failed. The old container may already be gone; the service could be DOWN."
  log "ERROR: docker compose ps; docker compose logs --tail=50 $SERVICE"
  exit 1
fi
rm -f "$FIRST_DEFERRED"

# --- did it come back? ------------------------------------------------------
for _ in $(seq 1 30); do
  body="$(curl -fsS --max-time 5 "$HEALTH_URL" 2>/dev/null || true)"
  case "$body" in
    *'"ok":true'*|*'"ok": true'*)
      log "healthy on $target"
      exit 0
      ;;
  esac
  sleep 2
done

log "ERROR: did not become healthy within 60s. Container left running for inspection:"
log "  docker compose logs --tail=50 $SERVICE"
exit 1
