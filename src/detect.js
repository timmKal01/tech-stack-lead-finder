// Rule engine over src/signatures.json. One homepage response in, a list of
// {name, category, confidence, evidence} out. Evidence is the first rule that
// gave the reported confidence, e.g. "header:x-shopid" or "script:cdn.shopify.com".
import { readFileSync } from 'node:fs';

const DEFAULT_CONFIDENCE = { header: 'high', cookie: 'high', meta: 'high', script: 'medium', link: 'medium', html: 'low' };
const RANK = { low: 1, medium: 2, high: 3 };

function compile(sig) {
    return {
        name: sig.name,
        category: sig.category,
        rules: sig.rules.map((r) => {
            const type = Object.keys(DEFAULT_CONFIDENCE).find((t) => t in r);
            if (!type) throw new Error(`Signature "${sig.name}" has a rule with no known type`);
            const pattern = type === 'header' ? r.value : type === 'meta' ? r.content : type === 'cookie' ? r.cookie : type === 'html' ? r.html : r[type];
            return {
                type,
                key: type === 'header' ? r.header.toLowerCase() : type === 'meta' ? r.meta.toLowerCase() : null,
                re: pattern === undefined ? null : new RegExp(pattern, 'i'),
                confidence: r.confidence ?? DEFAULT_CONFIDENCE[type],
                source: pattern ?? r.header,
            };
        }),
    };
}

export function loadSignatures(path = new URL('./signatures.json', import.meta.url)) {
    const data = JSON.parse(readFileSync(path, 'utf8'));
    return data.signatures.map(compile);
}

/** Cookie names from Set-Cookie headers (fetch joins multiple into one string, or gives getSetCookie()). */
export function cookieNames(setCookies) {
    const list = Array.isArray(setCookies) ? setCookies : String(setCookies ?? '').split(/,(?=\s*[^;,=\s]+=)/);
    return list.map((c) => c.split('=')[0].trim()).filter(Boolean);
}

/**
 * @param {object} page
 * @param {Record<string,string>} page.headers lowercased header names
 * @param {string[]} page.cookies cookie names
 * @param {string} page.html
 * @param {import('cheerio').CheerioAPI} page.$
 */
export function buildContext({ headers, cookies, html, $ }) {
    const attr = (sel, name) => $(sel).map((_, el) => $(el).attr(name)).get().filter(Boolean);
    const meta = {};
    $('meta[name], meta[property]').each((_, el) => {
        const key = ($(el).attr('name') ?? $(el).attr('property')).toLowerCase();
        const content = $(el).attr('content');
        if (content) meta[key] = meta[key] ? `${meta[key]} ${content}` : content;
    });
    return {
        headers: Object.fromEntries(Object.entries(headers ?? {}).map(([k, v]) => [k.toLowerCase(), String(v)])),
        cookies: cookies ?? [],
        html: String(html ?? ''),
        scripts: attr('script[src]', 'src'),
        links: attr('link[href]', 'href'),
        meta,
    };
}

/** What a rule matched, as readable evidence ("header: powered-by: Shopify", "script: cdn.shopify.com"), or null. */
function ruleMatch(rule, ctx) {
    const first = (list) => {
        for (const s of list) {
            const m = rule.re.exec(s);
            if (m) return m[0];
        }
        return null;
    };
    switch (rule.type) {
        case 'header': {
            const v = ctx.headers[rule.key];
            if (v === undefined || (rule.re && !rule.re.test(v))) return null;
            return rule.re ? `${rule.key}: ${v.slice(0, 60)}` : rule.key;
        }
        case 'cookie': return first(ctx.cookies) && ctx.cookies.find((c) => rule.re.test(c));
        case 'meta': return ctx.meta[rule.key] !== undefined && rule.re.test(ctx.meta[rule.key]) ? `${rule.key}: ${ctx.meta[rule.key].slice(0, 60)}` : null;
        case 'script': return first(ctx.scripts);
        case 'link': return first(ctx.links);
        case 'html': return rule.re.exec(ctx.html)?.[0].slice(0, 80) ?? null;
        default: return null;
    }
}

/** @returns {{name: string, category: string, confidence: 'high'|'medium'|'low', evidence: string}[]} */
export function detect(signatures, ctx) {
    const found = [];
    for (const sig of signatures) {
        let best = null;
        for (const rule of sig.rules) {
            if (best && RANK[rule.confidence] <= RANK[best.rule.confidence]) continue;
            const hit = ruleMatch(rule, ctx);
            if (hit) best = { rule, hit };
            if (best?.rule.confidence === 'high') break;
        }
        if (best) found.push({ name: sig.name, category: sig.category, confidence: best.rule.confidence, evidence: `${best.rule.type}: ${best.hit}` });
    }
    return found;
}

// ---------- filters ----------

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** Resolve user-typed names ("woo commerce", "google analytics") to signature names; unknown ones are reported. */
export function resolveNames(names, signatures) {
    const byNorm = new Map(signatures.map((s) => [norm(s.name), s.name]));
    const aliases = { ga: 'Google Analytics', ga4: 'Google Analytics', gtm: 'Google Tag Manager', facebookpixel: 'Meta Pixel', fbpixel: 'Meta Pixel', woo: 'WooCommerce', convertkit: 'Kit (ConvertKit)', sendinblue: 'Brevo', nextjs: 'Next.js', vue: 'Vue.js', tawk: 'Tawk.to', zendeskchat: 'Zendesk', sfcc: 'Salesforce Commerce Cloud', demandware: 'Salesforce Commerce Cloud', twitterpixel: 'X Pixel', reviewsio: 'REVIEWS.io', judgeme: 'Judge.me', tailwind: 'Tailwind CSS', cloudfront: 'AWS CloudFront' };
    const known = [];
    const unknown = [];
    for (const n of names ?? []) {
        const hit = byNorm.get(norm(n)) ?? aliases[norm(n)];
        if (hit) known.push(hit);
        else if (String(n).trim()) unknown.push(String(n).trim());
    }
    return { known: [...new Set(known)], unknown };
}

/**
 * requireAll: every one must be present. requireAny: at least one. exclude: none may be present.
 * With no filters at all, every site that loaded is a match.
 * @returns {{matched: boolean, matchedFilters: {requireAll: string[], requireAny: string[], excluded: string[]}}}
 */
export function applyFilters(techNames, { requireAll = [], requireAny = [], exclude = [] }) {
    const has = new Set(techNames);
    const all = requireAll.filter((n) => has.has(n));
    const any = requireAny.filter((n) => has.has(n));
    const excluded = exclude.filter((n) => has.has(n));
    const matched = all.length === requireAll.length && (requireAny.length === 0 || any.length > 0) && excluded.length === 0;
    return { matched, matchedFilters: { requireAll: all, requireAny: any, excluded } };
}
