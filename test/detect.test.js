// Signature matching against real homepages captured 2026-09-26 (gzipped HTML + response headers).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import * as cheerio from 'cheerio';
import { applyFilters, buildContext, cookieNames, detect, loadSignatures, resolveNames } from '../src/detect.js';
import { isChallenge } from '../src/fetch.js';

const signatures = loadSignatures();

function page(name) {
    const html = gunzipSync(readFileSync(new URL(`./fixtures/${name}.html.gz`, import.meta.url))).toString('utf8');
    const rawHeaders = readFileSync(new URL(`./fixtures/${name}.headers.txt`, import.meta.url), 'utf8');
    const headers = {};
    const setCookies = [];
    for (const line of rawHeaders.split(/\r?\n/).slice(1)) {
        const i = line.indexOf(':');
        if (i < 1) continue;
        const k = line.slice(0, i).trim().toLowerCase();
        const v = line.slice(i + 1).trim();
        if (k === 'set-cookie') setCookies.push(v);
        else headers[k] = headers[k] ? `${headers[k]}, ${v}` : v;
    }
    const status = Number(rawHeaders.split(' ')[1]);
    return { html, headers, setCookies, status };
}

function techOf(name) {
    const p = page(name);
    const found = detect(signatures, buildContext({ headers: p.headers, cookies: cookieNames(p.setCookies), html: p.html, $: cheerio.load(p.html) }));
    return Object.fromEntries(found.map((t) => [t.name, t]));
}

test('signatures.json is valid: unique names, known rule types, patterns compile', () => {
    const raw = JSON.parse(readFileSync(new URL('../src/signatures.json', import.meta.url)));
    const names = raw.signatures.map((s) => s.name);
    assert.equal(new Set(names).size, names.length, 'duplicate names');
    assert.ok(names.length >= 80, `${names.length} signatures`);
    for (const s of raw.signatures) {
        assert.ok(s.name && s.category && s.rules.length, s.name);
        for (const r of s.rules) {
            const types = ['header', 'cookie', 'meta', 'script', 'link', 'html'].filter((t) => t in r);
            assert.equal(types.length, 1, `${s.name}: rule ${JSON.stringify(r)}`);
            if (r.confidence) assert.ok(['high', 'medium', 'low'].includes(r.confidence));
        }
    }
    // Everything the original website-tech-stack-detector knew is still here.
    for (const n of ['WordPress', 'Drupal', 'Joomla', 'Wix', 'Squarespace', 'Webflow', 'Ghost', 'HubSpot CMS', 'Shopify', 'WooCommerce', 'Magento', 'BigCommerce', 'Next.js', 'Nuxt', 'React', 'Vue.js', 'Angular', 'jQuery', 'Google Analytics', 'Google Tag Manager', 'Meta Pixel', 'Hotjar', 'Segment', 'Mixpanel', 'Cloudflare', 'Vercel', 'Netlify', 'AWS CloudFront', 'Fastly', 'GitHub Pages', 'Stripe', 'PayPal', 'Intercom', 'Drift', 'Zendesk']) {
        assert.ok(names.includes(n), `missing ${n}`);
    }
});

test('Shopify store with Klaviyo (colourpop.com): header match is high confidence', () => {
    const t = techOf('colourpop.com');
    assert.equal(t.Shopify.confidence, 'high');
    assert.match(t.Shopify.evidence, /^(header|cookie): /);
    assert.ok(t.Klaviyo, 'Klaviyo');
    assert.equal(t.Klaviyo.category, 'email-marketing');
    assert.ok(t.Cloudflare);
    assert.ok(!t.WordPress && !t.WooCommerce && !t.Magento, 'no other ecommerce platform');
});

test('Shopify store without Klaviyo (allbirds.com)', () => {
    const t = techOf('allbirds.com');
    assert.equal(t.Shopify.confidence, 'high');
    assert.equal(t.Klaviyo, undefined);
});

test('WooCommerce on WordPress (woocommerce.com)', () => {
    const t = techOf('woocommerce.com');
    assert.ok(t.WordPress);
    assert.ok(t.WooCommerce);
    assert.equal(t.Shopify, undefined);
});

test('HubSpot site (hubspot.com): CMS from headers, tracking script', () => {
    const t = techOf('hubspot.com');
    assert.equal(t['HubSpot CMS'].confidence, 'high');
    assert.ok(t.HubSpot);
    assert.equal(t.Shopify, undefined);
});

test('bot walls are recognised, real pages are not', () => {
    const wall = page('bombas.com');
    assert.equal(wall.status, 429);
    assert.ok(isChallenge(wall.status, wall.headers, wall.html), 'Vercel Security Checkpoint');
    for (const name of ['colourpop.com', 'allbirds.com', 'woocommerce.com', 'hubspot.com']) {
        const p = page(name);
        assert.ok(!isChallenge(p.status, p.headers, p.html), name);
    }
    assert.ok(isChallenge(403, { 'cf-mitigated': 'challenge' }, ''));
    assert.ok(isChallenge(503, {}, '<html><head><title>Just a moment...</title>'));
});

test('filters: requireAll, requireAny, exclude', () => {
    const shopifyKlaviyo = ['Shopify', 'Klaviyo', 'Cloudflare'];
    const shopifyOnly = ['Shopify', 'Google Tag Manager'];
    const woo = ['WordPress', 'WooCommerce'];
    const f = (techs, filters) => applyFilters(techs, { requireAll: [], requireAny: [], exclude: [], ...filters });

    // Shopify stores NOT using Klaviyo
    const notKlaviyo = { requireAll: ['Shopify'], exclude: ['Klaviyo'] };
    assert.equal(f(shopifyKlaviyo, notKlaviyo).matched, false);
    assert.deepEqual(f(shopifyKlaviyo, notKlaviyo).matchedFilters.excluded, ['Klaviyo']);
    assert.equal(f(shopifyOnly, notKlaviyo).matched, true);

    const anyPlatform = { requireAny: ['Shopify', 'WooCommerce', 'BigCommerce'] };
    assert.equal(f(woo, anyPlatform).matched, true);
    assert.deepEqual(f(woo, anyPlatform).matchedFilters.requireAny, ['WooCommerce']);
    assert.equal(f(['Cloudflare'], anyPlatform).matched, false);

    assert.equal(f(shopifyKlaviyo, { requireAll: ['Shopify', 'Klaviyo'] }).matched, true);
    assert.equal(f(shopifyOnly, { requireAll: ['Shopify', 'Klaviyo'] }).matched, false);
    assert.equal(f(['Anything'], {}).matched, true, 'no filters: every loaded site matches');
});

test('filter names are forgiving and unknown names are reported', () => {
    const { known, unknown } = resolveNames(['shopify', 'woo commerce', 'GA4', 'google analytics', 'nextjs', 'Klavyio'], signatures);
    assert.deepEqual(known, ['Shopify', 'WooCommerce', 'Google Analytics', 'Next.js']);
    assert.deepEqual(unknown, ['Klavyio']);
});

test('cookie names from Set-Cookie', () => {
    assert.deepEqual(cookieNames(['_shopify_y=abc; Path=/', 'cart=1; Expires=Wed, 21 Oct 2026 07:28:00 GMT']), ['_shopify_y', 'cart']);
    assert.deepEqual(cookieNames('a=1; Path=/, b=2; Expires=Wed, 21 Oct 2026 07:28:00 GMT'), ['a', 'b']);
});
