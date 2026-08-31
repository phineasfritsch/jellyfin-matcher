# Contributing

Thanks for looking. This is a small project with an unusual amount of scaffolding
around it, and the scaffolding is the part worth explaining before you touch anything.

## The one command

```bash
npm run gate -- --fast
```

Types, the test suite, the counts, and the pinned claims. It is what CI runs and it
blocks the Docker image from publishing. If it is green your change is very likely fine;
if it is red, read on before changing the check.

```bash
npm run gate            # the above plus a production build
npm run gate -- --prod  # also checks a deployed instance (needs MATCHER_URL)
```

## Pinned claims, and why a test might fail for a good reason

`src/ui/__tests__/pins.test.ts` asserts around ninety properties that nothing else
asserts: accessibility hooks, copy that discloses what an action costs, empty states
that explain themselves, promises made in the README. They exist because these are
exactly the things a refactor deletes while every normal test stays green.

When a pin fails it is one of two things, and from a diff they look identical:

1. **Your change broke something.** Fix the change.
2. **Your change deliberately changed the form, and the property survives.** Fix the
   pin — but say so in its `why` field, and only after confirming the property is
   still true somewhere a person actually meets it.

Never weaken a pin into something a blank page would pass. If you find yourself editing
several pins to make one change go green, that is a signal about the change.

Adding a feature? Add its pins **before** you write it. A guard written afterwards can
only find what has already gone. `npm run inventory` lists candidates mechanically.

## Ground rules

- **Never `git add -A`.** Stage explicit paths.
- **Never run two `npm run e2e` at once.** It binds port 3000 and, in Any Movie mode,
  can fire a real Jellyseerr request that lands in Radarr. That is not a flaky test,
  it is a download.
- **Raise the floors in `gates.json`** in the same commit that legitimately adds tests
  or pins. They are floors, not equalities: the gate fails when a count goes *down*,
  because that is what a silent deletion looks like.
- Pushing `main` publishes the image. There is no separate deploy step.

## Design decisions

Numbered rulings live in [docs/REDESIGN.md](docs/REDESIGN.md) (R01–R18) and
[docs/DIRECTION.md](docs/DIRECTION.md) (R19 onward). They are numbered so a line of code
can cite the decision it exists because of, and so you can argue with a specific one
rather than with the general vibe. If your change contradicts a ruling, say which.

## What gets merged quickly

Bug fixes with a test. Accessibility fixes. Anything that makes the first run easier.
Copy that is more honest than what it replaces.

## What needs a conversation first

New dependencies, anything that adds an irreversible action, anything that puts a
number on screen without saying what it covers, and features that widen the scope past
"a room of people decide on one film, fast". Open an issue and we will talk about it.
