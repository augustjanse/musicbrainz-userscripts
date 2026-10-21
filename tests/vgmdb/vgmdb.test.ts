import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from 'vitest';

import { ALBUMS } from './config.ts';
import { loadParseVgmdbHtml } from './load-parser.ts';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(DIR, 'fixtures');
const SNAPSHOTS_DIR = path.join(DIR, 'snapshots');

const parseVgmdbHtml = loadParseVgmdbHtml();

const albums = ALBUMS.map(({ url, description }) => ({
    id: path.basename(new URL(url).pathname),
    url,
    description,
}));

test.each(albums)('$id: $description', ({ id, url }) => {
    const fixture = fs.readFileSync(path.join(FIXTURES_DIR, `${id}.html`), 'utf8');
    const snapshot = JSON.parse(fs.readFileSync(path.join(SNAPSHOTS_DIR, `${id}.json`), 'utf8')) as Record<string, unknown>;

    expect(parseVgmdbHtml(fixture, url)).toEqual(snapshot);
});
