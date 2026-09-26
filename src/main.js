import { Actor, log } from 'apify';
import * as cheerio from 'cheerio';
import { getPage } from './fetch.js';
import { parseRobots, isAllowed } from './robots.js';
import { applyFilters, buildContext, cookieNames, detect, loadSignatures, resolveNames } from './detect.js';
import { enrichmentTargets, extractEmails, extractPhones, extractSocials, hrefs, pageFacts, visibleText } from './contact.js';
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
const domainList = [...new Set((emptyForm ? DEFAULT_DOMAINS : domains).map(normalizeDomain).filter(Boolean))];
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
log.info(`Checking ${domainList.length} domain(s).`, filters);

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

async function checkDomain(domain) {
    const base = { domain, matched: false, status: 'ok', technologies: [], matchedFilters: null, emails: [], phones: [], socials: {}, title: null, description: null, language: null, httpStatus: null, pagesChecked: [], sourceUrl: `https://${domain}/`, scrapedAt };
    let home = `https://${domain}/`;
    if (!(await allowed(home))) return { ...base, status: 'robots_disallowed' };

    let res = await getPage(home);
    if (res.category === 'network_error' && !/timed out/i.test(res.error ?? '')) {
        home = `http://${domain}/`;
        res = await getPage(home);
    }
    base.pagesChecked.push({ url: home, result: res.ok ? 'ok' : res.category });
    base.httpStatus = res.status || null;
    base.sourceUrl = res.finalUrl ?? home;
    if (!res.ok) return { ...base, status: res.category === 'network_error' ? 'unreachable' : res.category, error: res.error ?? null };

    const $ = cheerio.load(res.body);
    const technologies = detect(signatures, buildContext({ headers: res.headers, cookies: cookieNames(res.setCookies), html: res.body, $ }));
    const { matched, matchedFilters } = applyFilters(technologies.map((t) => t.name), filters);
    const row = { ...base, matched, technologies, matchedFilters, ...pageFacts($, res.headers) };
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
    row.emails = extractEmails(text, links.filter((h) => /^mailto:/i.test(h)));
    row.phones = extractPhones(text, links.filter((h) => /^tel:/i.test(h)));
    row.socials = extractSocials(links);
    return row;
}

let matchedCount = 0;
let done = 0;
let cursor = 0;
const counts = {};
await Promise.all(Array.from({ length: Math.min(CONCURRENCY, domainList.length) }, async () => {
    while (cursor < domainList.length && matchedCount < maxItems) {
        const domain = domainList[cursor++];
        let row;
        try {
            row = await checkDomain(domain);
        } catch (err) {
            log.warning(`${domain}: failed`, { error: err.message });
            row = { domain, matched: false, status: 'error', error: err.message, sourceUrl: `https://${domain}/`, scrapedAt };
        }
        done++;
        counts[row.status] = (counts[row.status] ?? 0) + 1;
        if (row.matched && matchedCount < maxItems) {
            matchedCount++;
            await Actor.pushData(row);
            await Actor.charge({ eventName: MATCH_EVENT });
            log.info(`${domain}: match (${row.technologies.length} technologies, ${row.emails.length} email(s), ${row.phones.length} phone(s))`);
        } else {
            if (includeNonMatches) await Actor.pushData({ ...row, matched: false });
            log.info(`${domain}: ${row.status === 'ok' ? 'no match' : row.status}`);
        }
    }
}));

log.info(`Done: ${matchedCount} matching site(s) of ${done} checked.`, counts);
if (matchedCount >= maxItems) log.info(`Stopped at maxItems (${maxItems}).`);
await Actor.exit();
