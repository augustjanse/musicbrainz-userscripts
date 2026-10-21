/*
 * Albums to test. The main snapshot of each album holds the tracklist of the
 * tab selected on the page; `languages` lists other tracklist tabs to snapshot
 * separately.
 */
export const ALBUMS: readonly { url: string; description: string; languages?: readonly string[] }[] = [
    {
        url: 'https://vgmdb.net/album/47239',
        description: 'two CDs, Romaji and Japanese tracklists, release event',
        languages: ['Japanese'],
    },
    { url: 'https://vgmdb.net/album/4333', description: 'promotional release, English tracklist, marketplace link only' },
    { url: 'https://vgmdb.net/album/164917', description: 'two digital discs, barcode, stores, Japanese tracklist' },
    { url: 'https://vgmdb.net/album/164959', description: 'single digital track, stores without known link types' },
];
