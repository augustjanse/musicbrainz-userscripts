# VGMdb importer tests

Snapshot tests for `parseVgmdbPage` in `vgmdb_importer.user.js`. Each test checks that a saved VGMdb album page is converted into the expected MusicBrainz import format.

## Layout

```
tests/vgmdb/
  config.ts            albums to test (URL + description)
  vgmdb.test.ts        Vitest test file
  load-parser.ts       loads parseVgmdbPage in Node and parses fixtures with jsdom
  update-snapshots.ts  regenerates the snapshots
  fixtures/            saved VGMdb album pages
  snapshots/           expected parser output
```

## Fixtures and snapshots

A **fixture** is the HTML of a VGMdb album page as served to a logged-out visitor (e.g. `fixtures/47239.html` for https://vgmdb.net/album/47239). Fixtures are committed to the repo so tests do not need network access. They are kept exactly as served, so `oxfmt.config.ts` excludes them from formatting.

A **snapshot** is the JSON produced by running `parseVgmdbPage` on that fixture (e.g. `snapshots/47239.json`). It is the expected MusicBrainz import data: title, date, status, labels, barcode, URLs, discs, tracks, durations, and so on. Values that are `undefined` are left out.

Snapshot files are formatted by oxfmt. Regeneration is a separate command from the tests because the tests compare parsed JSON rather than serialized text.

## How tests work

1. Read each entry listed in `config.ts`.
2. Load the matching fixture from `fixtures/<id>.html` and parse it with jsdom, which builds the same DOM as a browser would. The page’s scripts are not run and no resources are loaded.
3. Run `parseVgmdbPage` on the document (via `load-parser.ts`, which loads the userscript in a Node VM with the required mocks).
4. Parse `snapshots/<id>.json` and compare it to the parser output with deep equality. Object key order is ignored, but array order and values still matter.

CI runs `pnpm test` on every pull request, which includes these tests. No request to VGMdb is made.

## Adding a test case

1. Find a VGMdb album that exercises the behaviour you care about.
2. While logged out, save the page’s HTML source (not the DOM as modified by scripts or other userscripts) as `fixtures/<id>.html`.
3. Add an entry to `ALBUMS` in `config.ts`:

    ```ts
    export const ALBUMS = [
        // ...
        { url: 'https://vgmdb.net/album/1234', description: 'brief note on what this covers' },
    ] as const;
    ```

4. Regenerate the snapshots and check the new one against the album page by hand.
5. Run all tests.
6. Commit the new fixture, snapshot, and config change.

Pick albums that cover distinct cases (several media formats, several tracklist languages, missing fields, etc.) rather than many similar ones.

## Commands

Run the VGMdb tests:

```bash
pnpm test:vgmdb
```

Regenerate snapshots after an intentional parser change:

```bash
pnpm test:vgmdb:update-snapshots
```

If a test fails after a parser change you intended, review the failure, regenerate the snapshots, inspect the file diff, and commit the updated files.
