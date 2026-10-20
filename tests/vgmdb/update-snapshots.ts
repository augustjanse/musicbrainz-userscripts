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

for (const { url } of ALBUMS) {
    const id = path.basename(new URL(url).pathname);
    const fixture = fs.readFileSync(path.join(FIXTURES_DIR, `${id}.html`), 'utf8');
    const result = parseVgmdbHtml(fixture, url);

    fs.writeFileSync(path.join(SNAPSHOTS_DIR, `${id}.json`), `${JSON.stringify(result, null, 4)}\n`);
}
