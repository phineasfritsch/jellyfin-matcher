import type { Metadata } from 'next';
import { Clapperboard, Laptop, Search, Smartphone, Tv } from 'lucide-react';

// Embedded in Jellyfin via the Custom Tabs plugin (an iframe pointing here),
// so it renders standalone with no login gate.
export const dynamic = 'force-dynamic';

/*
  One string, used as the page's <h1> and as its <title>.

  WCAG 2.2 A 2.4.2 wants a title that describes the page, and A 1.3.1 wants a
  heading that does the same; this page had a good heading and inherited the
  app's name as its title, so the two disagreed about what the page was. Written
  once rather than twice because they are the same claim, and two copies of a
  claim is how the disagreement happened in the first place.

  What the test on this can and cannot see: `routes.test.ts` catches the heading
  or the metadata going missing, and catches the <h1> becoming an <h2>. It
  cannot catch the two drifting apart, because a single const makes that
  impossible rather than merely tested.

  Not in `src/ui/strings.ts` (R145/R146): the catalogue holds what the UI says
  to a room, and nothing under `app/` has been migrated yet. When it is, this
  moves with the rest — the duplication guard already scans `app/`, so it will
  notice if a copy is left behind.
*/
const HEADING = 'How to use the server';

export const metadata: Metadata = {
  title: HEADING,
};

function host(url: string | undefined, fallback: string): string {
  if (!url) return fallback;
  try {
    return new URL(url).host;
  } catch {
    return fallback;
  }
}

export default function GuidePage() {
  const jellyfinUrl = process.env.JELLYFIN_URL ?? '';
  const jellyseerrUrl = process.env.JELLYSEERR_URL ?? '';
  const jellyfinHost = host(jellyfinUrl, 'your Jellyfin server');
  const jellyseerrHost = host(jellyseerrUrl, 'Jellyseerr');

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-8 sm:px-8">
      <header className="mb-10 flex flex-col gap-3">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{HEADING}</h1>
        <p className="max-w-2xl text-base leading-relaxed text-muted-fg">
          Everything you need to start watching on {jellyfinHost}: which apps to install on your TV,
          phone, and laptop, how to request something we don&apos;t have yet, and how to settle
          movie night when nobody can decide.
        </p>
      </header>

      <Section id="tv" icon={<Tv aria-hidden className="size-6" />} title="Watch on your TV">
        <p className="mb-5 text-muted-fg">
          Almost every TV platform has a Jellyfin app. Install it, point it at{' '}
          <Code>{jellyfinUrl || 'your server address'}</Code>, and sign in with the account you were
          given.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <ClientCard
            name="Android TV / Google TV / Chromecast"
            detail="Official Jellyfin app from the Play Store. Easiest option, best supported."
          />
          <ClientCard
            name="Amazon Fire TV / Fire Stick"
            detail="Official Jellyfin app from the Amazon Appstore. Search 'Jellyfin' on the device."
          />
          <ClientCard
            name="Apple TV"
            detail="Swiftfin (free, official) from the App Store. Infuse works well too if you use it."
          />
          <ClientCard
            name="Roku"
            detail="Official Jellyfin channel from the Roku store. Solid, a little plainer than the rest."
          />
          <ClientCard
            name="Samsung (Tizen) / LG (webOS)"
            detail="Jellyfin is in both smart-TV stores. If yours is missing, a cheap Fire Stick fixes it."
          />
          <ClientCard
            name="Kodi"
            detail="Add the Jellyfin for Kodi plugin if you already run Kodi and want one unified library."
          />
        </div>
      </Section>

      <Section
        id="phone"
        icon={<Smartphone aria-hidden className="size-6" />}
        title="Watch on your phone or tablet"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <ClientCard
            name="iPhone / iPad"
            detail="Swiftfin (free, official) is the one to get. Infuse is a slicker paid alternative with better format support."
          />
          <ClientCard
            name="Android"
            detail="Official Jellyfin app works fine. Findroid is a great community-built alternative; Streamyfin is another good one."
          />
        </div>
        <p className="mt-5 text-muted-fg">
          Each one asks for the server address (<Code>{jellyfinUrl || 'your server address'}</Code>)
          and your login, then your library and resume points sync everywhere.
        </p>
      </Section>

      <Section
        id="laptop"
        icon={<Laptop aria-hidden className="size-6" />}
        title="Watch on your laptop or desktop"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <ClientCard
            name="Any web browser"
            detail={`Just go to ${jellyfinHost} and sign in. Nothing to install. Chrome, Edge, Firefox, and Safari all work.`}
          />
          <ClientCard
            name="Jellyfin Media Player"
            detail="Free desktop app for Windows, macOS, and Linux. Smoother playback and more file types than the browser."
          />
        </div>
      </Section>

      <Section
        id="request"
        icon={<Search aria-hidden className="size-6" />}
        title="Want something we don't have?"
      >
        <p className="mb-4 text-muted-fg">
          We use <strong className="text-foreground">Jellyseerr</strong> for requests. If a movie or
          show isn&apos;t in the library, ask for it there and it gets downloaded and added
          automatically.
        </p>
        <Steps
          steps={[
            <>
              Go to <Code>{jellyseerrUrl || jellyseerrHost}</Code> and sign in with your Jellyfin
              account (same login).
            </>,
            'Search for the movie or show you want.',
            'Open it and hit Request. For a show you can pick specific seasons.',
            "That's it. It shows up in Jellyfin once it finishes downloading.",
          ]}
        />
      </Section>

      <Section
        id="matcher"
        icon={<Clapperboard aria-hidden className="size-6" />}
        title="Can't agree on a movie? Use Matcher"
      >
        <p className="mb-4 text-muted-fg">
          <strong className="text-foreground">Jellyfin Matcher</strong> is a swipe game for picking
          something together. Everyone joins on their phone and it guarantees a pick.
        </p>
        <Steps
          steps={[
            'One person opens Matcher and taps Create Room. A short code and QR appear.',
            'Everyone else scans the QR or types the code, then picks server-only or any movie.',
            "You each check the genres you're up for; a quick knockout narrows it to two.",
            'Then swipe: right to like, left to pass, up for maybe, star for a super like. Tap a poster for the trailer and ratings.',
            'When everyone likes the same movie it locks in. If the deck runs out first, points decide a winner anyway.',
          ]}
        />
        <a
          href="/"
          target="_top"
          className="mt-6 inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-accent px-6 font-semibold text-background transition active:scale-95"
        >
          <Clapperboard aria-hidden className="size-5" /> Open Matcher
        </a>
      </Section>

      <footer className="mt-12 border-t border-border pt-6 text-sm text-muted-fg">
        Trouble signing in anywhere? Your username and password are the same across Jellyfin,
        Jellyseerr, and Matcher. If something isn&apos;t working, ask whoever runs the server.
      </footer>
    </main>
  );
}

function Section({
  id,
  icon,
  title,
  children,
}: {
  id: string;
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="mb-12 scroll-mt-6">
      <h2 className="mb-4 flex items-center gap-3 text-2xl font-bold">
        <span className="flex size-11 items-center justify-center rounded-xl bg-secondary text-on-primary">
          {icon}
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function ClientCard({ name, detail }: { name: string; detail: string }) {
  return (
    <div className="rounded-xl border border-border bg-muted p-4">
      <h3 className="mb-1 font-semibold">{name}</h3>
      <p className="text-sm leading-relaxed text-muted-fg">{detail}</p>
    </div>
  );
}

function Steps({ steps }: { steps: React.ReactNode[] }) {
  return (
    <ol className="flex flex-col gap-3">
      {steps.map((step, i) => (
        <li key={i} className="flex gap-3">
          <span className="tabular flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-accent">
            {i + 1}
          </span>
          <span className="pt-0.5 leading-relaxed text-muted-fg">{step}</span>
        </li>
      ))}
    </ol>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return <code className="rounded bg-primary px-1.5 py-0.5 text-sm text-accent">{children}</code>;
}
