# Maintaining this

Gate **U11** of [UPSTREAM.md](UPSTREAM.md): *more than one person can release
it; the release is reproducible; there is a written answer to "what happens when
the maintainer stops".*

Two of those three are true. The first is not, and this document exists partly
to say so where an adopter will see it before they depend on it.

## The bus factor is one

Every commit in this repository is from one person. There is no second
maintainer, no release rota, and nobody else has ever cut a release. If that
person stops, this project stops — and because a household runs it on their own
hardware, "stops" means their Friday nights keep working until something in
Jellyfin, Node or a dependency changes underneath them, at which point nobody is
coming.

That is the honest position. It is the single hardest gate on the list to close,
because it cannot be closed by writing code.

**What would actually close it:** a second person with publish rights who has
cut a release, and a `CODEOWNERS` file that routes review to more than one name.
Nothing else counts. Documentation about how to release does not make a second
releaser exist.

**What this document does instead:** make the release reproducible enough that a
stranger could pick it up cold. That is not the same thing, and it is not
pretended to be.

## The release is reproducible

- `package-lock.json` is committed, and CI installs with `npm ci`, so a build
  resolves the same tree every time rather than whatever npm feels like today.
- The Node version is pinned in **both** places that matter: `engines` in
  `package.json` and `node-version` in the workflow. A test requires them to
  agree, because two pins that can drift apart are one pin and a lie.
- Publishing is triggered by a `v*.*.*` tag, so what ships is a named,
  pinnable version rather than a moving `:latest`. A compose file can name a
  version it can roll back to.
- Nothing publishes past a red gate: the `docker` job `needs: gate`, and the
  gate runs the full `npm run gate`, not `--fast`. That was a deliberate choice
  and the reasoning is in the workflow's own comments (R82 — `--fast` skips the
  check for the worst bug this repo ever shipped).

**Known limit:** only `linux/amd64` is published. arm64 — a Raspberry Pi, most
NAS boxes — is not, and the README says so rather than implying it works.

## Releasing

1. `npm run gate` — green, checked by **exit code**. Not by reading the last
   lines of output; a failing run's last lines are advice text, and that mistake
   has been made here.
2. Update `CHANGELOG.md`.
3. Tag `vX.Y.Z` and push the tag. CI builds and publishes.
4. Check the published tag exists before telling anyone it does.

## Keeping it alive

- **Dependencies** update weekly via `.github/dependabot.yml`, grouped so a
  contributor sees one PR rather than nine. Every one runs the full gate before
  it can merge.
- **Rot is checked on a schedule.** The gate also runs weekly on `main` with no
  push, because a project people install and leave alone breaks from the
  outside — a dependency, a Node release, a GitHub Actions deprecation — and
  without a scheduled run the first person to find out is a household on a
  Friday night.
- **Security reports** go through [SECURITY.md](../SECURITY.md), privately.

## If you are picking this up cold

Read, in this order: [OPERATING.md](../OPERATING.md), then
[CLAUDE.md](../CLAUDE.md), then [QUEUE.md](../QUEUE.md) for what is open, then
[docs/UPSTREAM.md](UPSTREAM.md) for the bar the project is being held to now.

The two things most likely to surprise you:

- **The gate is the argument.** 622 cases and 190 pinned claims, and the pins
  assert sentences the UI actually shows, so changing copy will fail tests on
  purpose. Read [docs/RULINGS.md](RULINGS.md) before deciding a pin is wrong.
- **A green suite is not evidence by itself.** An audit found that 49 of 97
  claims did not fail when the defect they name was reintroduced (R129). Before
  you trust a test, break the thing it guards and watch it go red. There is a
  harness for this; see [docs/MUTATION.md](MUTATION.md) if it exists yet.
