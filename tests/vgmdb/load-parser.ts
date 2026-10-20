import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as vm from 'node:vm';

import { JSDOM } from 'jsdom';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');

type ParseVgmdbPage = (doc: unknown, url: string) => Record<string, unknown>;

type ParseVgmdbHtml = (html: string, url: string) => Record<string, unknown>;

function createJQuery() {
    const jQuery = () => ({
        ready() {
            // userscript bootstrapping is not needed for unit tests
        },
    });
    jQuery.noConflict = () => jQuery;
    return jQuery;
}

function loadParseVgmdbPage(): ParseVgmdbPage {
    const sandbox: vm.Context & { parseVgmdbPage?: ParseVgmdbPage } = {
        console,
        jQuery: createJQuery(),
        document: {},
        window: { location: { href: '' } },
    };
    vm.createContext(sandbox);

    let script = fs.readFileSync(path.join(ROOT, 'vgmdb_importer.user.js'), 'utf8');
    script = script.replace(/^\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==\r?\n/, '');

    vm.runInContext(script, sandbox);

    const parseVgmdbPage = sandbox.parseVgmdbPage;
    if (typeof parseVgmdbPage !== 'function') {
        throw new Error('parseVgmdbPage was not loaded');
    }
    return parseVgmdbPage;
}

/*
 * Returns a function that parses the HTML of a VGMdb album page with the
 * userscript’s parser. Scripts in the page are never run.
 */
export function loadParseVgmdbHtml(): ParseVgmdbHtml {
    const parseVgmdbPage = loadParseVgmdbPage();

    return function parseVgmdbHtml(html, url) {
        // jsdom neither runs the page’s scripts nor loads its resources by default
        const dom = new JSDOM(html, { url });
        try {
            // Round-trip through JSON to drop undefined values, as in the stored snapshots
            return JSON.parse(JSON.stringify(parseVgmdbPage(dom.window.document, url))) as Record<string, unknown>;
        } finally {
            dom.window.close();
        }
    };
}
