import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Jellyfin Matcher',
    short_name: 'Matcher',
    description: 'Swipe together, watch tonight',
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
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
