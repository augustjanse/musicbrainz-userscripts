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

const albums = ALBUMS.map(({ url, description, languages = [] }) => ({
    id: path.basename(new URL(url).pathname),
    url,
    description,
    languages,
}));

function readFixture(id: string) {
    return fs.readFileSync(path.join(FIXTURES_DIR, `${id}.html`), 'utf8');
}

function readSnapshot(name: string) {
    return JSON.parse(fs.readFileSync(path.join(SNAPSHOTS_DIR, `${name}.json`), 'utf8')) as Record<string, unknown>;
}

test.each(albums)('$id: $description', ({ id, url }) => {
    expect(parseVgmdbHtml(readFixture(id), url)).toEqual(readSnapshot(id));
});

const tracklists = albums.flatMap(({ id, url, languages }) => languages.map(language => ({ id, url, language })));

test.each(tracklists)('$id: $language tracklist', ({ id, url, language }) => {
    expect(parseVgmdbHtml(readFixture(id), url, language)).toEqual(readSnapshot(`${id}.${language}`));
});

test('47239: falls back to the Japanese tracklist when no tab is active', () => {
    const fixture = readFixture('47239').replace('<li class="active">', '<li>');
    expect(fixture).not.toContain('class="active"');

    expect(parseVgmdbHtml(fixture, 'https://vgmdb.net/album/47239')).toEqual(readSnapshot('47239.Japanese'));
});
