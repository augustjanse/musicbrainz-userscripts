import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ALBUMS } from './config.ts';
import { loadParseVgmdbHtml } from './load-parser.ts';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(DIR, 'fixtures');
const SNAPSHOTS_DIR = path.join(DIR, 'snapshots');

const parseVgmdbHtml = loadParseVgmdbHtml();

fs.mkdirSync(SNAPSHOTS_DIR, { recursive: true });

function writeSnapshot(name: string, result: Record<string, unknown>) {
    fs.writeFileSync(path.join(SNAPSHOTS_DIR, `${name}.json`), `${JSON.stringify(result, null, 4)}\n`);
}

for (const { url, languages = [] } of ALBUMS) {
    const id = path.basename(new URL(url).pathname);
    const fixture = fs.readFileSync(path.join(FIXTURES_DIR, `${id}.html`), 'utf8');

    writeSnapshot(id, parseVgmdbHtml(fixture, url));
    for (const language of languages) {
        writeSnapshot(`${id}.${language}`, parseVgmdbHtml(fixture, url, language));
    }
}
