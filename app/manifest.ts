import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Jellyfin Matcher',
    short_name: 'Matcher',
    description: 'Swipe together, watch tonight',
    start_url: '/',
    display: 'standalone',
    /*
      R133 / WCAG 2.2 AA 1.3.4 Orientation. This was `orientation: 'portrait'`,
      which locks the INSTALLED app: a phone in a stand, or somebody who holds a
      device one way because of how they sit, could not rotate it. The layout is
      a single column and reflows either way, so the lock bought nothing and
      cost a criterion.
    */
    background_color: '#0B0E11',
    theme_color: '#0B0E11',
    icons: [
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'maskable',
      },
    ],
  };
}
