import { Actor, log } from 'apify';
import * as cheerio from 'cheerio';
import { getPage } from './fetch.js';
import { parseRobots, isAllowed } from './robots.js';
import { applyFilters, buildContext, cookieNames, detect, groupByCategory, loadSignatures, resolveNames, serverFacts } from './detect.js';
import { businessEmails, enrichmentTargets, extractEmails, extractPhones, extractSocials, hrefs, pageFacts, visibleText } from './contact.js';
import { normalizeDomain } from './domains.js';

await Actor.init();

/** Must match the event name in this Actor's pay-per-event pricing. Only matching sites are charged. */
const MATCH_EVENT = 'matched-site';
// Verified 2026-09-26: the first five are Shopify stores that load without a bot wall.
const DEFAULT_DOMAINS = ['allbirds.com', 'colourpop.com', 'kyliecosmetics.com', 'brooklinen.com', 'skullcandy.com', 'wordpress.org', 'woocommerce.com', 'basecamp.com', 'ghost.org', 'prestashop.com'];
const CONCURRENCY = 5;

const input = (await Actor.getInput()) ?? {};
const emptyForm = !input.domains?.length;
const noFilters = !input.requireAll?.length && !input.requireAny?.length && !input.exclude?.length;
const {
    domains = DEFAULT_DOMAINS,
    requireAll = [],
    requireAny = emptyForm && noFilters ? ['Shopify'] : [],
    exclude = [],
    enrich = true,
    includeNonMatches = false,
    maxItems = 1000,
} = input;
const rawDomains = emptyForm ? DEFAULT_DOMAINS : domains;
const domainList = [...new Set(rawDomains.map(normalizeDomain).filter(Boolean))];
const invalidEntries = rawDomains.filter((d) => !normalizeDomain(d) && String(d ?? '').trim());
if (emptyForm) log.info(`No domains given, using the example list and "requireAny: Shopify": ${domainList.join(', ')}`);

const signatures = loadSignatures();
const filters = {};
for (const [key, names] of Object.entries({ requireAll, requireAny, exclude })) {
    const { known, unknown } = resolveNames(names, signatures);
    if (unknown.length) {
        throw new Error(`Unknown technology in ${key}: ${unknown.join(', ')}. Known names include: ${signatures.map((s) => s.name).join(', ')}`);
    }
    filters[key] = known;
}
// Detect mode: no filters, so the buyer wants every site's stack (the Wappalyzer-style use, which
// website-tech-stack-detector served until it was merged in here). Every site then gets a row: sites that
// couldn't be checked come back as free error rows with the reason, as if includeNonMatches were on.
const detectMode = !filters.requireAll.length && !filters.requireAny.length && !filters.exclude.length;
log.info(`Checking ${domainList.length} domain(s)${detectMode ? ' in detect mode (no filters: every site gets a row)' : ''}.`, filters);

const scrapedAt = new Date().toISOString();
const robotsCache = new Map();
async function allowed(url) {
    const { origin, pathname, search } = new URL(url);
    if (!robotsCache.has(origin)) {
        const res = await getPage(`${origin}/robots.txt`, { accept: 'text/plain' });
        robotsCache.set(origin, res.ok ? parseRobots(res.body) : []);
    }
    return isAllowed(robotsCache.get(origin), pathname + search);
}

/** A plain-language reason for a site that couldn't be checked. */
function reasonFor(status, httpStatus, error) {
    switch (status) {
        case 'robots_disallowed': return "The site's robots.txt doesn't allow checking its homepage, so it was skipped.";
        case 'blocked': return 'The site answered with a bot protection page. This actor doesn\'t try to get around those.';
        case 'unreachable': {
            const e = String(error ?? '');
            if (/ENOTFOUND|EAI_AGAIN/i.test(e)) return "The domain doesn't resolve (DNS lookup failed).";
            if (/timed out|TIMEOUT|ETIMEDOUT/i.test(e)) return "The site didn't respond in time.";
            if (/ECONNREFUSED/i.test(e)) return 'The server refused the connection.';
            if (/ECONNRESET|socket hang up|UND_ERR_SOCKET/i.test(e)) return 'The server closed the connection.';
            if (/CERT|SSL|TLS/i.test(e)) return "The site's SSL certificate couldn't be verified.";
            return `The site couldn't be reached${e ? ` (${e})` : ''}.`;
        }
        case 'not_found': return `The homepage answered with HTTP ${httpStatus ?? 404} (not found).`;
        case 'rate_limited': return 'The site kept answering "too many requests" (HTTP 429), even after waiting.';
        case 'server_error': return `The site answered with a server error (HTTP ${httpStatus ?? '5xx'}).`;
        case 'client_error': return `The site answered with HTTP ${httpStatus ?? 'an error'}.`;
        case 'not_html': return "The address isn't an HTML web page.";
        default: return error ?? null;
    }
}

/** Every field a site row has, empty, so rows that failed have the same columns as rows that loaded. */
const blankRow = (domain) => ({ domain, matched: false, status: 'ok', error: null, technologies: [], stack: groupByCategory([]), matchedFilters: null, emails: [], phones: [], socials: {}, title: null, description: null, language: null, httpStatus: null, server: null, poweredBy: null, generator: null, pagesChecked: [], sourceUrl: `https://${domain}/`, scrapedAt });

async function checkDomain(domain) {
    const base = blankRow(domain);
    let home = `https://${domain}/`;
    if (!(await allowed(home))) return { ...base, status: 'robots_disallowed', error: reasonFor('robots_disallowed') };

    let res = await getPage(home);
    if (res.category === 'network_error' && !/timed out/i.test(res.error ?? '')) {
        home = `http://${domain}/`;
        res = await getPage(home);
    }
    base.pagesChecked.push({ url: home, result: res.ok ? 'ok' : res.category });
    base.httpStatus = res.status || null;
    base.sourceUrl = res.finalUrl ?? home;
    if (!res.ok) {
        const status = res.category === 'network_error' ? 'unreachable' : res.category;
        return { ...base, status, error: reasonFor(status, res.status || null, res.error), ...(res.headers ? serverFacts(res.headers) : {}) };
    }

    const $ = cheerio.load(res.body);
    const technologies = detect(signatures, buildContext({ headers: res.headers, cookies: cookieNames(res.setCookies), html: res.body, $ }));
    const { matched, matchedFilters } = applyFilters(technologies.map((t) => t.name), filters);
    const row = { ...base, matched, technologies, stack: groupByCategory(technologies), matchedFilters, ...pageFacts($, res.headers), ...serverFacts(res.headers, $) };
    if (!matched) return row;

    // Contact details, from the homepage plus at most two more pages.
    const pages = [{ $, url: res.finalUrl ?? home }];
    if (enrich) {
        const targets = enrichmentTargets($, res.finalUrl ?? home);
        for (const url of [targets.contact, targets.about]) {
            if (!(await allowed(url))) { row.pagesChecked.push({ url, result: 'robots_disallowed' }); continue; }
            const page = await getPage(url);
            row.pagesChecked.push({ url, result: page.ok ? 'ok' : page.category });
            if (page.ok) pages.push({ $: cheerio.load(page.body), url: page.finalUrl ?? url });
        }
    }
    const links = pages.flatMap((p) => hrefs(p.$, p.url));
    const text = pages.map((p) => visibleText(p.$)).join(' ');
    // Business addresses only (generic mailboxes and ones carrying the site's name), never a staff member's own.
    row.emails = businessEmails(extractEmails(text, links.filter((h) => /^mailto:/i.test(h))), res.finalUrl ?? home);
    row.phones = extractPhones(text, links.filter((h) => /^tel:/i.test(h)));
    row.socials = extractSocials(links);
    return row;
}

let matchedCount = 0;
let savedRows = 0;
let done = 0;
let cursor = 0;
const counts = {};

// Entries that aren't a domain at all get a free row saying so, instead of disappearing silently.
for (const entry of invalidEntries) {
    await Actor.pushData({ rowType: 'error', domain: null, input: String(entry), matched: false, status: 'invalid_input', error: 'Not a domain or website address. Use something like "example.com" or "https://example.com".', scrapedAt });
    savedRows++;
}
await Promise.all(Array.from({ length: Math.min(CONCURRENCY, domainList.length) }, async () => {
    while (cursor < domainList.length && matchedCount < maxItems) {
        const domain = domainList[cursor++];
        let row;
        try {
            row = await checkDomain(domain);
        } catch (err) {
            log.warning(`${domain}: failed`, { error: err.message });
            row = { ...blankRow(domain), status: 'error', error: err.message };
        }
        done++;
        counts[row.status] = (counts[row.status] ?? 0) + 1;
        if (row.matched && matchedCount < maxItems) {
            matchedCount++;
            savedRows++;
            await Actor.pushData({ rowType: 'site', ...row });
            await Actor.charge({ eventName: MATCH_EVENT });
            log.info(`${domain}: match (${row.technologies.length} technologies, ${row.emails.length} email(s), ${row.phones.length} phone(s))`);
        } else {
            // In detect mode a site that loaded always matches, so only sites that couldn't be checked land here.
            if (includeNonMatches || detectMode) {
                savedRows++;
                await Actor.pushData({ rowType: row.status === 'ok' ? 'site' : 'error', ...row, matched: false });
            }
            log.info(`${domain}: ${row.status === 'ok' ? 'no match' : row.status}`);
        }
    }
}));

log.info(`Done: ${matchedCount} matching site(s) of ${done} checked.`, counts);
if (matchedCount >= maxItems) log.info(`Stopped at maxItems (${maxItems}).`);

// A run that saved nothing says why in one free row, so an empty dataset is never a mystery.
if (savedRows === 0) {
    const checked = Object.entries(counts).map(([status, n]) => `${n} ${status === 'ok' ? 'loaded but didn\'t match' : status}`).join(', ') || 'none';
    const note = domainList.length === 0
        ? 'No domains to check. Add domains like "example.com" to the domains list.'
        : `No site matched your filters. Checked ${done} of ${domainList.length} domain(s): ${checked}. Turn on includeNonMatches to see every site with its technologies, or leave all three filters empty to get every site's full stack.`;
    await Actor.pushData({ rowType: 'note', note, filters, checked: counts, scrapedAt });
}
await Actor.exit();
