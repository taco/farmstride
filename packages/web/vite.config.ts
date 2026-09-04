import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { sentryVitePlugin } from '@sentry/vite-plugin';
import { visualizer } from 'rollup-plugin-visualizer';
import path from 'path';
import fs from 'fs';
import { pwaManifest } from './pwaManifest';

function getHttpsConfig(): { key: string; cert: string } | false {
    if (process.env.USE_HTTPS === 'false') {
        return false;
    }
    const key = path.resolve(__dirname, '../../localhost+3-key.pem');
    const cert = path.resolve(__dirname, '../../localhost+3.pem');
    if (fs.existsSync(key) && fs.existsSync(cert)) {
        return { key, cert };
    }
    return false;
}

const httpsConfig = getHttpsConfig();
const apiTarget =
    process.env.VITE_API_URL ??
    (httpsConfig ? 'https://localhost:4000' : 'http://localhost:4000');

export default defineConfig({
    define: {
        __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    },
    build: {
        sourcemap: 'hidden',
    },
    plugins: [
        react(),
        tailwindcss(),
        VitePWA({
            registerType: 'prompt',
            includeAssets: [
                'favicon.ico',
                'favicon.svg',
                'apple-touch-icon.png',
            ],
            manifest: pwaManifest,
        }),
        sentryVitePlugin({
            authToken:
                process.env.SENTRY_AUTH_TOKEN || process.env.SENTRY_TOKEN,
            disable: !(
                process.env.SENTRY_AUTH_TOKEN || process.env.SENTRY_TOKEN
            ),
            org: process.env.SENTRY_ORG,
            project: process.env.SENTRY_PROJECT,
            sourcemaps: {
                filesToDeleteAfterUpload: ['./dist/**/*.map'],
            },
        }),
        process.env.ANALYZE &&
            visualizer({
                filename: 'dist/stats.html',
                open: true,
                gzipSize: true,
                brotliSize: true,
                template: 'treemap',
            }),
    ],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
    server: {
        port: 3000,
        https: httpsConfig || undefined,
        host: true,
        proxy: {
            '/api': {
                target: apiTarget,
                secure: false,
            },
            '/graphql': {
                target: apiTarget,
                secure: false,
            },
            '/health': {
                target: apiTarget,
                secure: false,
            },
        },
    },
});
