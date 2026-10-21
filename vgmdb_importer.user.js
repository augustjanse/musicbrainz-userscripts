// ==UserScript==
// @name         Import VGMdb releases into MusicBrainz
// @namespace    https://github.com/murdos/musicbrainz-userscripts/
// @description  One-click importing of releases from vgmdb.net into MusicBrainz.
// @version      2026.10.20.1
// @downloadURL  https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/vgmdb_importer.user.js
// @updateURL    https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/vgmdb_importer.user.js
// @match        https://vgmdb.net/album/*
// @match        https://vgmdb.net/artist/*
// @match        https://vgmdb.net/org/*
// @run-at       document-start
// @require      https://code.jquery.com/jquery-3.5.1.min.js
// @require      https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/0d35cbc2fc679e20b7ff865c7945a3cc64f3615a/lib/mbimport.js
// @require      lib/logger.js
// @require      lib/mbimportstyle.js
// @icon         https://metabrainz.org/static/img/projects/musicbrainz.svg
// @grant        none
// ==/UserScript==

// The script runs in the page context, so keep a private reference to the
// required jQuery, as the page later loads its own, older one.
const $ = jQuery.noConflict(true);

$(document).ready(function () {
    if (!isAlbumUrl(window.location.href)) {
        return;
    }

    MBImportStyle();
    MBSearchItStyle();

    const release = parseVgmdbPage(document, window.location.href);
    insertButtons(release);
});

/*
 * Returns whether the URL points to a VGMdb album page, the only page type
 * the importer can parse.
 */
function isAlbumUrl(url) {
    return /^https?:\/\/vgmdb\.net\/album\/\d+/.test(url);
}

/*
 * Returns a MusicBrainz release object parsed from a VGMdb album page.
 */
function parseVgmdbPage(doc, url) {
    return mapRelease(parseVgmdbAlbum(doc, url));
}

/*
 * Returns a MusicBrainz release object based on the album data extracted by
 * parseVgmdbAlbum.
 */
function mapRelease(vgmdbAlbum) {
    const releaseDate = mapDate(vgmdbAlbum.release_date);

    const release = {
        title: vgmdbAlbum.name,
        artist_credit: [],
        status: mapStatus(vgmdbAlbum.publish_format),
        year: releaseDate.year,
        month: releaseDate.month,
        day: releaseDate.day,
        labels: [{ name: mapLabel(vgmdbAlbum.organizations), catno: vgmdbAlbum.catalog }],
        barcode: vgmdbAlbum.barcode,
        urls: mapUrls(vgmdbAlbum.vgmdb_link, vgmdbAlbum.stores, vgmdbAlbum.websites),
        discs: mapDiscs(vgmdbAlbum.discs, vgmdbAlbum.media_format),
    };

    return release;
}

/*
 * Returns the album data of a VGMdb album page, structured like the album
 * objects of the former vgmdb.info API so that the mapping helpers below can
 * consume it. Track titles are kept for every tracklist language; the language
 * to import is chosen later, in mapTracks.
 */
function parseVgmdbAlbum(doc, url) {
    const vgmdbAlbum = {
        name: parseAlbumName(doc),
        vgmdb_link: getVgmdbLink(url),
        organizations: [],
        discs: parseTracklists(doc),
        ...parseRightColumn(doc),
    };

    const infoTable = doc.querySelector('#rightfloat table');
    if (infoTable) {
        parseAlbumInfo(infoTable, vgmdbAlbum);
    }

    return vgmdbAlbum;
}

/*
 * Returns the English album title from the page heading.
 */
function parseAlbumName(doc) {
    const heading = doc.querySelector('#innermain h1');
    if (!heading) {
        return '';
    }

    const names = parseNames(heading);
    if (names.en) {
        return names.en;
    }

    const firstTitle = heading.querySelector('.albumtitle');
    return getText(firstTitle || heading).trim();
}

/*
 * Returns the canonical VGMdb album URL, without query string or fragment.
 */
function getVgmdbLink(url) {
    const match = url.match(/vgmdb\.net\/album\/(\d+)/);
    return match ? `https://vgmdb.net/album/${match[1]}` : url;
}

/*
 * Adds the fields of the album information table (catalog number, release
 * date, formats, barcode, organizations) to vgmdbAlbum.
 */
function parseAlbumInfo(infoTable, vgmdbAlbum) {
    const singleValueFields = {
        'Publish Format': 'publish_format',
        'Media Format': 'media_format',
        Barcode: 'barcode',
    };
    const organizationRoles = ['Publisher', 'Distributor', 'Retailer', 'Exclusive Retailer', 'Manufacturer', 'Label'];

    for (const row of infoTable.rows) {
        const [nameCell, valueCell] = row.cells;
        const nameElement = nameCell && nameCell.querySelector('b');
        if (!nameElement || !valueCell) {
            continue;
        }
        const name = getText(nameElement).trim();

        if (name === 'Catalog Number') {
            // The catalog number is the first piece of text; links to reprints may follow
            vgmdbAlbum.catalog = getFirstText(valueCell).split('(')[0].trim();
        } else if (name === 'Release Date') {
            vgmdbAlbum.release_date = parseReleaseDate(valueCell);
        } else if (organizationRoles.includes(name)) {
            // “Exclusive Retailer” has the role “retailer”, as with the former API.
            // Like the former API, only linked organizations are taken into account.
            const role = name.split(' ').pop().toLowerCase();
            for (const anchor of valueCell.querySelectorAll('a')) {
                vgmdbAlbum.organizations.push({ names: parseNames(anchor), role: role });
            }
        } else if (Object.hasOwn(singleValueFields, name)) {
            const firstChild = valueCell.firstChild;
            vgmdbAlbum[singleValueFields[name]] = firstChild ? firstChild.textContent.trim() : '';
        }
    }
}

/*
 * Returns the release date of the release date cell as an ISO 8601 date
 * string (YYYY, YYYY-MM or YYYY-MM-DD), or the raw text if it can’t be parsed.
 */
function parseReleaseDate(valueCell) {
    const calendarLink = valueCell.querySelector('a[href*="calendar.php"]');
    if (calendarLink) {
        const fragment = calendarLink.getAttribute('href').split('#')[1] || '';
        if (/^\d{8}$/.test(fragment)) {
            return `${fragment.slice(0, 4)}-${fragment.slice(4, 6)}-${fragment.slice(6, 8)}`;
        }
        return parseDateText(getText(calendarLink));
    }

    return parseDateText(getFirstText(valueCell));
}

/*
 * Returns an ISO 8601 date string based on a VGMdb date such as “Aug 15, 2014”,
 * “Aug 2014” or “2014”, or the input if it can’t be parsed.
 */
function parseDateText(text) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const trimmed = text.trim();

    const match = trimmed.match(/^(?:([A-Z][a-z]+)\.? +(?:(\d{1,2}), *)?)?(\d{4})$/);
    if (!match) {
        return trimmed;
    }

    const [, monthName, day, year] = match;
    if (!monthName) {
        return year;
    }
    const month = months.indexOf(monthName.slice(0, 3)) + 1;
    if (!month) {
        return trimmed;
    }

    const isoDate = `${year}-${String(month).padStart(2, '0')}`;
    return day ? `${isoDate}-${day.padStart(2, '0')}` : isoDate;
}

/*
 * Returns the stores (“Available at”) and websites (“Websites”) listed in the
 * right column of the page.
 */
function parseRightColumn(doc) {
    const sections = {};

    for (const header of doc.querySelectorAll('#rightcolumn > div')) {
        const heading = header.querySelector(':scope > div > h3');
        if (!heading) {
            continue;
        }

        let content = header.nextElementSibling;
        while (content && content.tagName !== 'DIV') {
            content = content.nextElementSibling;
        }
        const list = content && content.querySelector(':scope > div');
        if (!list) {
            continue;
        }

        const title = getText(heading).trim();
        if (title === 'Available at') {
            sections.stores = parseLinkList(list);
        } else if (title === 'Websites') {
            sections.websites = {};
            for (const category of list.querySelectorAll(':scope > div')) {
                const categoryName = category.querySelector('b');
                if (categoryName) {
                    sections.websites[getText(categoryName).trim()] = parseLinkList(category);
                }
            }
        }
    }

    return sections;
}

/*
 * Returns the name and target of every link in the spans directly under the
 * given element.
 */
function parseLinkList(element) {
    const links = [];

    for (const span of element.querySelectorAll(':scope > span')) {
        const anchor = span.querySelector('a');
        if (anchor && anchor.getAttribute('href')) {
            links.push({ link: stripRedirect(anchor.getAttribute('href')), name: getText(anchor).trim() });
        }
    }

    return links;
}

/*
 * Returns the external URL that a VGMdb /redirect/ link points to, or the
 * absolute URL of any other link.
 */
function stripRedirect(link) {
    const absoluteLink = /^https?:\/\//.test(link) ? link : `https://vgmdb.net/${link.replace(/^\//, '')}`;

    const match = absoluteLink.match(/^https?:\/\/vgmdb\.net\/redirect\/[^/]*\/(.*)$/);
    if (match) {
        // Redirect targets are stored without scheme; nested redirects are unwrapped
        const target = /^https?:\/\//.test(match[1]) ? match[1] : `http://${match[1]}`;
        return stripRedirect(target);
    }

    return absoluteLink;
}

/*
 * Returns a list of discs, each with a name and its tracks. Every track holds
 * its title in each tracklist language, keyed by the name of the language tab
 * (e.g. “Japanese”, “Romaji”, “English”), plus its length.
 */
function parseTracklists(doc) {
    const discs = [];

    // Each language tab links to its tracklist through the rel attribute
    const tabs = new Map(Array.from(doc.querySelectorAll('#tracklist > span[id]'), tab => [tab.id, tab]));

    for (const anchor of doc.querySelectorAll('#tlnav a[rel]')) {
        const tab = tabs.get(anchor.getAttribute('rel'));
        if (!tab) {
            continue;
        }
        const language = getText(anchor).trim();
        let discIndex = 0;

        for (const child of tab.children) {
            const discName = child.tagName === 'SPAN' ? child.querySelector(':scope > b') : null;
            if (!discName) {
                continue;
            }

            let table = child.nextElementSibling;
            while (table && table.tagName !== 'TABLE') {
                table = table.nextElementSibling;
            }
            if (!table) {
                break;
            }

            if (!discs[discIndex]) {
                discs[discIndex] = { tracks: [] };
            }
            const disc = discs[discIndex];
            disc.name = getText(discName).trim();

            let trackIndex = 0;
            for (const row of table.rows) {
                if (row.cells.length !== 3) {
                    continue;
                }
                const titleCell = row.cells[1];
                const lengthElement = row.cells[2].querySelector('span');
                const length = lengthElement ? getText(lengthElement).trim() : '';

                if (!disc.tracks[trackIndex]) {
                    disc.tracks[trackIndex] = { names: {}, track_length: length || 'Unknown' };
                }
                disc.tracks[trackIndex].names[language] = getText(titleCell).trim();
                trackIndex++;
            }

            discIndex++;
        }
    }

    // Discs without any track row can’t be imported
    return discs.filter(disc => disc.tracks.length);
}

/*
 * Returns a dict of names keyed by language code, based on the child spans
 * carrying a lang attribute (e.g. en, ja, ja-latn). Text directly inside the
 * element, if any, is treated as the English name.
 */
function parseNames(element) {
    const names = {};

    let shallowText = '';
    for (const node of element.childNodes) {
        if (node.nodeType === 3) {
            shallowText += node.textContent;
        }
    }
    shallowText = shallowText.replace(/\s+/g, ' ').trim();
    if (shallowText) {
        names.en = shallowText;
    }

    for (const span of element.querySelectorAll(':scope > span[lang]')) {
        names[span.getAttribute('lang').toLowerCase()] = getText(span).trim();
    }

    return names;
}

/*
 * Returns the text content of a node, leaving out <em> elements, which VGMdb
 * uses for the “ / ” separators between names in different languages.
 */
function getText(node) {
    if (node.nodeType === 3) {
        return node.textContent;
    }
    if (node.nodeType !== 1 || node.tagName === 'EM') {
        return '';
    }

    let text = '';
    for (const child of node.childNodes) {
        text += getText(child);
    }
    return text;
}

/*
 * Returns the first non-blank text node under a node, trimmed, or an empty
 * string.
 */
function getFirstText(node) {
    if (node.nodeType === 3) {
        return node.textContent.trim();
    }

    for (const child of node.childNodes) {
        const text = getFirstText(child);
        if (text) {
            return text;
        }
    }
    return '';
}

function insertButtons(release) {
    const editNote = MBImport.makeEditNote(window.location.href, 'VGMdb');
    console.log(editNote);
    const parameters = MBImport.buildFormParameters(release, editNote);
    const formHtml = $(MBImport.buildFormHTML(parameters)).attr('style', 'margin: 5px 0 0 5px; display: inline-block').prop('outerHTML');
    const linkHtml = $(MBImport.buildSearchButton(release)).attr('style', 'margin: 5px 0 0 5px; display: inline-block').prop('outerHTML');

    const vgmdbHtml =
        '<div style="width: 250px; background-color: #1B273D">' +
        '<b class="rtop"><b></b></b>' +
        '<div style="padding: 6px 10px 0px 10px">' +
        '<h3>MusicBrainz</h3>' +
        '</div>' +
        '</div>' +
        `<div style="width: 250px; background-color: #2F364F;">${formHtml}${linkHtml}` +
        '<b class="rbot"><b></b></b> ' +
        '</div>' +
        '<br style="clear: left" />';

    $('#rightcolumn').prepend(vgmdbHtml);
}

/*
 * Returns MusicBrainz status based on VGMdb publish_format.
 *
 * MusicBrainz: official, promotion, bootleg, pseudo
 * VGMdb, comma separated:
 *   * one of Commercial, Doujin/Indie, Bootleg
 *   * one of Limited Edition, Enclosure, First Press Bonus, Preorder Bonus,
 *     Retailer Bonus, Event Only, Promo/Gift/Reward, Rental (General does not appear in API)
 */
function mapStatus(publishFormat = '') {
    if (publishFormat.includes('Bootleg')) {
        // Overrides promo
        return 'bootleg';
    } else if (publishFormat.includes('Promo/Gift/Reward')) {
        return 'promotion';
    } else {
        return 'official';
    }
}

/*
 * Returns year, month and day dict based on ISO 8601 date string. Parts
 * missing from partial dates (YYYY or YYYY-MM) are left undefined.
 */
function mapDate(releaseDate = '') {
    const match = releaseDate.match(/^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?/);
    if (!match) {
        return {};
    }

    const [, year, month, day] = match;
    return {
        year: Number(year),
        month: month ? Number(month) : undefined,
        day: day ? Number(day) : undefined,
    };
}

/*
 * Returns a likely label based on a list of VGMdb organizations.
 */
function mapLabel(organizations) {
    const labelOrganization = getLabelOrganization(organizations);
    if (labelOrganization) {
        return labelOrganization['names']['en'];
    } else if (organizations.length == 1) {
        // If only one, assume that's the one
        return organizations[0]['names']['en'];
    } else {
        return null;
    }
}

/*
 * Returns a list of MusicBrainz URLs based on the websites, stores and
 * vgmdb_link values of the VGMdb album data.
 */
function mapUrls(vgmdbLink, stores, websites) {
    const urls = [];

    urls.push({ url: vgmdbLink, link_type: 86 });

    if (stores) {
        for (const store of stores) {
            const linkTypes = mapLinkTypes(store['name']);

            for (const linkType of linkTypes) {
                // Filter out links to internal marketplace
                if (store['link'].startsWith('http')) {
                    urls.push({ url: store['link'], link_type: linkType });
                }
            }
        }
    }

    if (websites && websites['Commercial']) {
        for (const commercial of websites['Commercial']) {
            // Seems to fill same purpose as stores for albums
            urls.push({ url: commercial['link'] });
        }
    }

    return urls;
}

/**
 * Returns an array of appropriate link_types given a VGMdb store name.
 */
function mapLinkTypes(storeName) {
    const amazonAsin = 77;
    const purchaseForMailOrder = 79;
    const purchaseForDownload = 74;
    const freeStreaming = 85;

    const linkTypes = [];
    switch (storeName) {
        case 'Amazon':
        case 'Amazon.co.jp':
            linkTypes.push(amazonAsin);
            break;
        case 'iTunes':
        case 'e-onkyo':
        case 'OTOTOY':
            linkTypes.push(purchaseForDownload);
            break;
        case 'CDJapan':
        case 'Play-Asia':
        case 'YesAsia':
            linkTypes.push(purchaseForMailOrder);
            break;
        case 'Spotify':
            linkTypes.push(freeStreaming);
            break;
        default:
            linkTypes.push(null);
            break;
    }

    return linkTypes;
}

/*
 * Returns a list of disc objects each featuring title, format and tracklist
 * based on VGMdb disc data and media format.
 */
function mapDiscs(vgmdbDiscs, mediaFormat = '') {
    const discs = [];

    let multipleMedia;
    let generalMediaFormat;
    if (mediaFormat.includes('+')) {
        multipleMedia = true;
    } else {
        generalMediaFormat = extractVgmdbMedia(mediaFormat);
    }

    for (const vgmdbDisc of vgmdbDiscs) {
        const disc = {};

        if (multipleMedia) {
            const discMediaFormat = extractVgmdbMedia(vgmdbDisc['name']);
            disc['format'] = mapFormat(discMediaFormat);
        } else {
            disc['format'] = mapFormat(generalMediaFormat);
        }

        disc['tracks'] = mapTracks(vgmdbDisc['tracks']);

        discs.push(disc);
    }

    return discs;
}

/*
 * Returns a MusicBrainz format based on a VGMdb media format.
 */
function mapFormat(mediaFormat) {
    switch (mediaFormat) {
        case 'Flexi Disc':
            return 'Vinyl';
        case 'Digital':
        case 'Download Card':
            return 'Digital Media';
        case 'SA-CD':
            return 'SACD';
        case 'CD Video':
            return 'CDV';
        case 'Laser Disc':
            return 'LaserDisc';
        case 'Floppy Disc':
            return 'Other';
        case 'USB':
            return 'USB Flash Drive';
        case 'UHQCD':
        case 'Blu-spec CD':
        case 'Blu-spec CD2':
        case 'HQCD':
        case 'SHM-CD':
            return 'CD';
        default:
            return mediaFormat;
    }
}

/*
 * Returns a MusicBrainz tracklist based on a VGMdb tracklist.
 */
function mapTracks(vgmdbTracks) {
    const tracks = [];

    const language = getTracklistLanguage(vgmdbTracks);
    for (const vgmdbTrack of vgmdbTracks) {
        tracks.push({ title: vgmdbTrack['names'][language], duration: vgmdbTrack['track_length'] });
    }

    return tracks;
}

/*
 * Returns the VGMdb style media format part of a string, or null if none is
 * found. If an album has only one type of media, the disc name won't contain
 * media format.
 *
 * Doesn't actually match every VGMdb media because they can have subformats
 * other than this.
 */
function extractVgmdbMedia(s) {
    const match = s.match(
        /(Cassette|Vinyl|Flexi Disc|DVD|Digital|SA-CD|Other|CD Video|VHS|Blu-ray|Laser Disc|Floppy Disc|USB|Download Card|UHQCD|Blu-spec CD|Blu-spec CD2|HQCD|SHM-CD|PLAYBUTTON|MiniDisc|CD)/g,
    );

    return match ? match[0] : null;
}

/*
 * Returns an organization element with the "label" role, or null if none exists.
 */
function getLabelOrganization(organizations) {
    for (const organization of organizations) {
        if (organization['role'] === 'label') {
            return organization;
        }
    }

    return null;
}

/*
 * Return the language used as key for the VGMdb tracklist.
 */
function getTracklistLanguage(vgmdbTracks) {
    let language;

    // VGMdb stores tracklists by album, not by disc. Thus it should be enough
    // to examine the first track to figure out which one to use.
    const track = vgmdbTracks[0];
    const languages = Object.keys(track['names']);

    const foreignLanguages = getForeignLanguages(languages);
    if (foreignLanguages.length) {
        // Should be the one printed tracklist, probably Japanese or in
        // some cases Korean
        language = foreignLanguages[0];
    } else if (languages.includes('English')) {
        // Either printed tracklist or pseudo-release translation
        language = 'English';
    } else if (languages.includes('Romaji')) {
        // Should be pseudo-release transliteration
        language = 'Romaji';
    }

    return language;
}

/*
 * Returns a list of languages other than English and Romaji in the input list.
 * This should be a list with zero or one elements.
 */
function getForeignLanguages(languages) {
    return languages.filter(language => language !== 'English' && language !== 'Romaji');
}
