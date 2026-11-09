import type { MetadataRoute } from 'next';
import { PRODUCT, THEME_COLOR } from '../lib/server';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: PRODUCT,
    short_name: 'DAX',
    description: 'Stores and inventory for DAX Engineering staff.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#f5f7fa',
    theme_color: THEME_COLOR,
    icons: [
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
