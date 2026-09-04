import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pwaManifest } from '../pwaManifest';

/**
 * Guards the install surface of the app: every icon the manifest and the
 * page head point at must be a real file in public/ at the declared size.
 * The manifest used to reference PNGs that did not exist, so home-screen
 * installs showed a broken image.
 */
const webRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..'
);
const publicDir = path.join(webRoot, 'public');
const indexHtml = fs.readFileSync(path.join(webRoot, 'index.html'), 'utf8');

function publicPath(src: string): string {
    return path.join(publicDir, src.replace(/^\//, ''));
}

function pngDimensions(file: string): string {
    const header = Buffer.alloc(24);
    const fd = fs.openSync(file, 'r');
    fs.readSync(fd, header, 0, 24, 0);
    fs.closeSync(fd);
    return `${header.readUInt32BE(16)}x${header.readUInt32BE(20)}`;
}

function headLinkHrefs(rel: string): string[] {
    const doc = new DOMParser().parseFromString(indexHtml, 'text/html');
    return Array.from(doc.querySelectorAll(`link[rel="${rel}"]`)).map(
        (link) => link.getAttribute('href') ?? ''
    );
}

const icons = pwaManifest.icons ?? [];

describe('PWA install assets', () => {
    it('every manifest icon is a PNG in public/ at its declared size', () => {
        expect(icons.length).toBeGreaterThan(0);
        for (const icon of icons) {
            const file = publicPath(icon.src);
            expect(fs.existsSync(file), `${icon.src} is missing`).toBe(true);
            expect(icon.type).toBe('image/png');
            expect(pngDimensions(file), `${icon.src} size`).toBe(icon.sizes);
        }
    });

    it('manifest declares a maskable icon for adaptive home screens', () => {
        const purposes = icons.map((icon) => String(icon.purpose ?? 'any'));
        expect(purposes).toContain('maskable');
    });

    it('page head references a favicon and apple-touch-icon that exist', () => {
        const favicons = headLinkHrefs('icon');
        const appleTouch = headLinkHrefs('apple-touch-icon');
        expect(favicons.length).toBeGreaterThan(0);
        expect(favicons).not.toContain('/vite.svg');
        for (const href of favicons) {
            expect(fs.existsSync(publicPath(href)), `${href} is missing`).toBe(
                true
            );
        }
        expect(appleTouch).toHaveLength(1);
        const appleTouchFile = publicPath(appleTouch[0]);
        expect(fs.existsSync(appleTouchFile), 'apple-touch-icon missing').toBe(
            true
        );
        expect(pngDimensions(appleTouchFile)).toBe('180x180');
    });
});
