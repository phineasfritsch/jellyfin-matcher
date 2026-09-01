import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google';
import './globals.css';

// Self-hosted by next/font, so nothing is fetched from a font CDN at runtime
// (R17: this has to work on a LAN with no route to the internet).
const plex = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-plex',
  display: 'swap',
});
const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-plex-mono',
  display: 'swap',
});


export const metadata: Metadata = {
  /*
    WCAG 2.2 A 2.4.2 Page Titled — the F9 half of B1 in docs/PLAN-1.1.md.

    This was the bare string 'Jellyfin Matcher', and neither the guide nor a
    room exported metadata of its own, so all three routes wore it. The guide is
    the case that shows why that is a defect rather than a tidiness complaint:
    its own visible heading says "How to use the server" and its tab said
    something else entirely. And on a phone that has the room, the guide and a
    second home screen open, the tab list is the only thing distinguishing them,
    which is exactly the situation the criterion was written for.

    `default` is the home screen's own title. It is not repeated in
    `app/page.tsx`: that screen's heading and its tab must say the same thing,
    and one of them saying it is enough — a second copy is just somewhere for it
    to drift.

    `template` is what every other segment wears. The distinguishing half goes
    FIRST because a tab strip truncates from the right, and a column of tabs all
    reading "Jellyf…" is the defect again under a different name.
  */
  title: {
    default: 'Jellyfin Matcher',
    template: '%s · Jellyfin Matcher',
  },
  description: 'Swipe together. Watch tonight. Zero stalemates.',
  applicationName: 'Jellyfin Matcher',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0B0E11',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${plex.variable} ${plexMono.variable}`}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
