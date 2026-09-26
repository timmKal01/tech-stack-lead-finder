import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import * as cheerio from 'cheerio';
import { enrichmentTargets, extractEmails, extractPhones, extractSocials, hrefs, pageFacts, visibleText } from '../src/contact.js';
import { normalizeDomain } from '../src/domains.js';
import { isAllowed, parseRobots } from '../src/robots.js';

test('emails: plain, mailto, and obfuscated', () => {
    assert.deepEqual(extractEmails('Write to info [at] acme [dot] com today'), ['info@acme.com']);
    assert.deepEqual(extractEmails('sales(at)acme(dot)co(dot)uk'), ['sales@acme.co.uk']);
    assert.deepEqual(extractEmails('Email: hello at acme dot io'), ['hello@acme.io']);
    assert.deepEqual(extractEmails('support{at}shop.example-store.com'), ['support@shop.example-store.com']);
    assert.deepEqual(extractEmails('press@acme.com'), ['press@acme.com']);
    assert.deepEqual(extractEmails('', ['mailto:Care@Acme.com?subject=Hi']), ['care@acme.com']);
});

test('emails: nothing invented from prose, templates or image names', () => {
    assert.deepEqual(extractEmails('Visit us at acme.com for more'), []);
    assert.deepEqual(extractEmails('Find us at the office dot com'), []);
    assert.deepEqual(extractEmails('you@example.com name@company.com logo@2x.png'), []);
});

test('emails: role addresses first, glued words cut off', () => {
    assert.deepEqual(extractEmails('maria.lopez@acme.com or sales@acme.com or hello@acme.com'), ['sales@acme.com', 'hello@acme.com', 'maria.lopez@acme.com']);
    // Real text from brooklinen.com: "...hello@brooklinen.com.The team..."
    assert.deepEqual(extractEmails('reach us at hello@brooklinen.com.The team will reply'), ['hello@brooklinen.com']);
});

test('phones: tel links and strict formats, deduped by digits', () => {
    assert.deepEqual(extractPhones('Call +1 (424) 363-8064', ['tel:+14243638064']), ['+1 (424) 363-8064']);
    assert.deepEqual(extractPhones('Call 646-798-7447 or (646) 798-7447'), ['646-798-7447']);
    assert.deepEqual(extractPhones('+44 20 7946 0958'), ['+44 20 7946 0958']);
    // Order numbers, dates, prices and version strings are not phones
    assert.deepEqual(extractPhones('Order #12345678, 2026-09-26, $1,299.00, v10.2.3, 500-999 1000'), []);
    assert.deepEqual(extractPhones('000-000-0000'), []);
});

test('socials: profile links only, not share buttons or posts', () => {
    const got = extractSocials([
        'https://www.facebook.com/sharer/sharer.php?u=x',
        'https://www.facebook.com/Brooklinen',
        'https://twitter.com/intent/tweet?text=hi',
        'https://x.com/brooklinen',
        'https://www.instagram.com/p/ABC123/',
        'https://www.instagram.com/brooklinen/',
        'https://www.linkedin.com/company/brooklinen/',
        'https://www.linkedin.com/in/some-person',
        'https://www.tiktok.com/@brooklinen',
    ]);
    assert.deepEqual(got, {
        facebook: 'https://www.facebook.com/Brooklinen',
        x: 'https://x.com/brooklinen',
        instagram: 'https://www.instagram.com/brooklinen',
        linkedin: 'https://www.linkedin.com/company/brooklinen',
        tiktok: 'https://www.tiktok.com/@brooklinen',
    });
});

test('real contact page (brooklinen.com/pages/contact)', () => {
    const html = gunzipSync(readFileSync(new URL('./fixtures/brooklinen.com_pages_contact.html.gz', import.meta.url))).toString('utf8');
    const $ = cheerio.load(html);
    const links = hrefs($, 'https://www.brooklinen.com/pages/contact');
    const emails = extractEmails(visibleText($), links.filter((h) => h.startsWith('mailto:')));
    assert.ok(emails.includes('hello@brooklinen.com'), emails.join(','));
    assert.ok(emails.every((e) => !e.endsWith('.the')), emails.join(','));
    assert.ok(isRoleFirst(emails));
    assert.ok(extractPhones(visibleText($), links.filter((h) => h.startsWith('tel:'))).length >= 1);
    const facts = pageFacts($, {});
    assert.equal(facts.language, 'en');
    assert.ok(facts.title);
});

function isRoleFirst(emails) {
    const role = /^(info|hello|contact|sales|support|help|press|care|team)@/;
    const firstNonRole = emails.findIndex((e) => !role.test(e));
    return firstNonRole === -1 || emails.slice(firstNonRole).every((e) => !role.test(e));
}

test('contact and about pages: links by path or short label, else the default paths', () => {
    const $ = cheerio.load(`<a href="/pages/contact">Get in touch</a><a href="/blog/learn-more-about-rewards">Learn more about rewards</a>
        <a href="/pages/our-story">Our Story</a><a href="https://help.other.com/contact">Contact</a>`);
    assert.deepEqual(enrichmentTargets($, 'https://www.shop.com/'), { contact: 'https://www.shop.com/pages/contact', about: 'https://www.shop.com/pages/our-story' });
    const empty = cheerio.load('<a href="/products/x">Shop</a>');
    assert.deepEqual(enrichmentTargets(empty, 'https://shop.com/'), { contact: 'https://shop.com/contact', about: 'https://shop.com/about' });
});

test('domain input normalisation', () => {
    assert.equal(normalizeDomain('https://www.Example.com/shop?x=1'), 'www.example.com');
    assert.equal(normalizeDomain('shop.example.co.uk'), 'shop.example.co.uk');
    assert.equal(normalizeDomain('not a domain'), null);
    assert.equal(normalizeDomain(''), null);
});

test('robots.txt is respected', () => {
    const rules = parseRobots('User-agent: *\nDisallow: /pages/contact\nAllow: /\n');
    assert.ok(isAllowed(rules, '/'));
    assert.ok(!isAllowed(rules, '/pages/contact'));
});
