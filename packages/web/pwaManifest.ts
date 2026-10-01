import type { ManifestOptions } from 'vite-plugin-pwa';

/**
 * Web app manifest for home-screen installs. Icon files live in public/ and
 * are placeholders (the "FS" wordmark from favicon.svg) until real artwork
 * exists. The maskable variant keeps the wordmark inside the 80% safe zone
 * so Android's adaptive-icon crop does not clip it.
 */
export const pwaManifest: Partial<ManifestOptions> = {
    name: 'FarmStride',
    short_name: 'FarmStride',
    description: 'Log riding sessions by voice and track your horses',
    display: 'standalone',
    theme_color: '#ffffff',
    icons: [
        {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
        },
        {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
        },
        {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
        },
    ],
};
