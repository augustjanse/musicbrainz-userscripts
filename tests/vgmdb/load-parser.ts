import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as vm from 'node:vm';

import { JSDOM } from 'jsdom';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');

type ParseVgmdbPage = (doc: unknown, url: string, language?: string) => Record<string, unknown>;

type GetSelectedTracklistLanguage = (doc: unknown) => string | undefined;

type Parser = { parseVgmdbPage: ParseVgmdbPage; getSelectedTracklistLanguage: GetSelectedTracklistLanguage };

type ParseVgmdbHtml = (html: string, url: string, language?: string) => Record<string, unknown>;

function createJQuery() {
    const jQuery = () => ({
        ready() {
            // userscript bootstrapping is not needed for unit tests
        },
    });
    jQuery.noConflict = () => jQuery;
    return jQuery;
}

function loadParser(): Parser {
    const sandbox: vm.Context & Partial<Parser> = {
        console,
        jQuery: createJQuery(),
        document: {},
        window: { location: { href: '' } },
    };
    vm.createContext(sandbox);

    let script = fs.readFileSync(path.join(ROOT, 'vgmdb_importer.user.js'), 'utf8');
    script = script.replace(/^\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==\r?\n/, '');

    vm.runInContext(script, sandbox);

    const { parseVgmdbPage, getSelectedTracklistLanguage } = sandbox;
    if (typeof parseVgmdbPage !== 'function' || typeof getSelectedTracklistLanguage !== 'function') {
        throw new Error('parseVgmdbPage or getSelectedTracklistLanguage was not loaded');
    }
    return { parseVgmdbPage, getSelectedTracklistLanguage };
}

/*
 * Returns a function that parses the HTML of a VGMdb album page with the
 * userscript’s parser, importing the given tracklist language or, like the
 * userscript, the tab selected on the page. Scripts in the page are never run.
 */
export function loadParseVgmdbHtml(): ParseVgmdbHtml {
    const { parseVgmdbPage, getSelectedTracklistLanguage } = loadParser();

    return function parseVgmdbHtml(html, url, language) {
        // jsdom neither runs the page’s scripts nor loads its resources by default
        const dom = new JSDOM(html, { url });
        try {
            // Round-trip through JSON to drop undefined values, as in the stored snapshots
            const doc = dom.window.document;
            const release = parseVgmdbPage(doc, url, language ?? getSelectedTracklistLanguage(doc));
            return JSON.parse(JSON.stringify(release)) as Record<string, unknown>;
        } finally {
            dom.window.close();
        }
    };
}
