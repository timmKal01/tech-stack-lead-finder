// Business contact details a site publishes: emails, phone numbers, social profiles, plus
// title / description / language. Nothing is guessed or generated: every email and phone
// number returned was written on the page (as text or a mailto:/tel: link).

// ---------- emails ----------

const AT = String.raw`\s*(?:\[\s*at\s*\]|\(\s*at\s*\)|\{\s*at\s*\}|<\s*at\s*>|\s+at\s+|@)\s*`;
const DOT = String.raw`\s*(?:\[\s*dot\s*\]|\(\s*dot\s*\)|\{\s*dot\s*\}|<\s*dot\s*>|\s+dot\s+|\.)\s*`;
const EMAIL_RE = new RegExp(String.raw`(?<![a-z0-9._%+-])([a-z0-9][a-z0-9._%+-]{0,63})${AT}([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:${DOT}[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*)${DOT}([a-z]{2,24})(?![a-z0-9])`, 'gi');
const VALID_EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,24}$/;
const IMAGE_EXT_RE = /\.(png|jpe?g|gif|svg|webp|avif|css|js)$/i;
// Template addresses and vendors' own addresses that appear in embedded widgets, not the site's contact.
const NOT_CONTACT_RE = /^(?:name|your|you|email|user|someone|example|test|john\.?doe|jane\.?doe|firstname|first\.last)@|@(?:example|domain|company|email|yourdomain|yourcompany|sentry|sentry-next|wixpress|mysite)\.(?:com|org|net|io)$|@(?:\d+x|2x|3x)\./i;
const PROSE_WORDS = new Set(['me', 'us', 'look', 'email', 'mail', 'contact', 'reach', 'available', 'based', 'work', 'join', 'here', 'out', 'more', 'found', 'located', 'office', 'visit', 'shop', 'find', 'sold', 'buy', 'order', 'orders']);

const ROLE_LOCAL_RE = /^(info|hello|hi|contact|sales|support|help|team|office|admin|enquiries|inquiries|care|customercare|customerservice|service|press|media|partners|partnerships|wholesale|business|marketing|orders|shop|store|general)$/;
export const isRoleAddress = (email) => ROLE_LOCAL_RE.test(email.split('@')[0]);

/**
 * Emails from mailto: links and visible text, including "info [at] domain [dot] com" and
 * "sales at domain dot com". Role addresses (info@, sales@, hello@...) come first.
 */
export function extractEmails(text, mailtoHrefs = []) {
    const out = [];
    const add = (raw) => {
        const e = String(raw).trim().toLowerCase().replace(/^mailto:/, '').split('?')[0].replace(/\.+$/, '');
        if (VALID_EMAIL_RE.test(e) && !IMAGE_EXT_RE.test(e) && !NOT_CONTACT_RE.test(e) && !out.includes(e)) out.push(e);
    };
    for (const h of mailtoHrefs) {
        try { add(decodeURIComponent(h.replace(/^mailto:/i, ''))); } catch { add(h.replace(/^mailto:/i, '')); }
    }
    for (const m of String(text ?? '').matchAll(EMAIL_RE)) {
        const [whole, local, domain, tld] = m;
        if (!whole.includes('@')) {
            // Spelled-out forms: " at " needs " dot " too (or brackets), and no prose words as the mailbox.
            const bracketed = /[[({<]\s*at\s*[\])}>]/i.test(whole);
            if (!bracketed && !/\bdot\b|[[({<]\s*dot/i.test(whole)) continue;
            if (PROSE_WORDS.has(local.toLowerCase())) continue;
        }
        let labels = domain.split(new RegExp(DOT, 'i'));
        let top = tld;
        // "hello@brooklinen.com.The team..." : a capitalised word glued on after the real TLD.
        if (/^[A-Z][a-z]/.test(tld) && labels.length > 1 && /^[a-z]{2,24}$/.test(labels.at(-1)) && domain === domain.toLowerCase()) {
            top = labels.at(-1);
            labels = labels.slice(0, -1);
        }
        add(`${local}@${labels.join('.')}.${top}`);
    }
    return [...out.filter(isRoleAddress), ...out.filter((e) => !isRoleAddress(e))];
}

// ---------- phones ----------

// Only formats that are unambiguously phone numbers: international with a leading +, or North
// American (xxx) xxx-xxxx / xxx-xxx-xxxx with one consistent separator. Looser digit patterns
// pick up order IDs, dates, prices and version strings. (Same rule as website-lead-extractor.)
const PHONE_RE = /\+\d{1,3}(?:[\s.-]?\(?\d{1,4}\)?){2,5}|\(\d{3}\)\s?\d{3}[\s.-]\d{4}\b|\b\d{3}([\s.-])\d{3}\1\d{4}\b/g;

/** Phones from tel: links and visible text, de-duplicated by digits, human-formatted version kept. */
export function extractPhones(text, telHrefs = []) {
    const byDigits = new Map();
    const raws = [...(String(text ?? '').match(PHONE_RE) ?? []), ...telHrefs.map((h) => { try { return decodeURIComponent(h.replace(/^tel:/i, '')); } catch { return h.replace(/^tel:/i, ''); } })];
    for (const raw of raws) {
        const phone = raw.trim().replace(/^[^\d+(]+|[^\d)]+$/g, '').replace(/^([^(]*)\)$/, '$1');
        if (/^\+0/.test(phone)) continue;
        let digits = phone.replace(/\D/g, '');
        if (digits.length < 7 || digits.length > 15) continue;
        if (/^(\d)\1+$/.test(digits)) continue; // 0000000000
        if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
        if (!byDigits.has(digits)) byDigits.set(digits, phone);
    }
    return [...byDigits.values()];
}

// ---------- socials ----------

const SOCIALS = {
    linkedin: /^https?:\/\/([a-z]{2,3}\.)?linkedin\.com\/(company|school|showcase)\/[^/?#]+/i,
    x: /^https?:\/\/(www\.)?(twitter|x)\.com\/(?!intent|share|home|search|hashtag|i\/)[A-Za-z0-9_]{1,15}\/?(?:[?#].*)?$/i,
    instagram: /^https?:\/\/(www\.)?instagram\.com\/(?!p\/|reel\/|explore\/|accounts\/)[A-Za-z0-9_.]+\/?(?:[?#].*)?$/i,
    facebook: /^https?:\/\/([a-z]{2,3}\.|www\.|m\.)?facebook\.com\/(?!sharer|share|dialog|plugins|tr\b|tr\?|login)[^?#]+/i,
    youtube: /^https?:\/\/(www\.)?youtube\.com\/(@[\w.-]+|c\/[\w.-]+|channel\/[\w-]+|user\/[\w.-]+)/i,
    tiktok: /^https?:\/\/(www\.)?tiktok\.com\/@[\w.-]+/i,
};

/** First profile link per network. Share buttons, posts and intent links are ignored. */
export function extractSocials(hrefs) {
    const out = {};
    for (const raw of hrefs) {
        const href = String(raw).trim().replace(/^\/\//, 'https://');
        for (const [net, re] of Object.entries(SOCIALS)) {
            if (!out[net] && re.test(href)) out[net] = href.replace(/[?#].*$/, '').replace(/\/$/, '');
        }
    }
    return out;
}

// ---------- page facts ----------

/** Visible text: scripts, styles and templates removed, text nodes joined with spaces. */
export function visibleText($) {
    const $$ = $.root().clone();
    $$.find('script, style, noscript, template, svg').remove();
    return $$.find('body').find('*').addBack().contents().filter((_, n) => n.type === 'text').map((_, n) => $(n).text()).get().join(' ').replace(/\s+/g, ' ');
}

export function pageFacts($, headers = {}) {
    const clean = (s) => (s ? s.replace(/\s+/g, ' ').trim() || null : null);
    const lang = $('html').attr('lang') || headers['content-language']?.split(',')[0] || $('meta[property="og:locale"]').attr('content')?.replace('_', '-') || null;
    return {
        title: clean($('title').first().text()) ?? clean($('meta[property="og:title"]').attr('content')),
        description: clean($('meta[name="description"]').attr('content')) ?? clean($('meta[property="og:description"]').attr('content')),
        language: lang ? lang.trim() : null,
    };
}

/** Links on a page, resolved to absolute URLs. */
export function hrefs($, base) {
    return $('a[href]').map((_, el) => $(el).attr('href')).get().map((h) => {
        if (/^(mailto|tel):/i.test(h)) return h;
        try { return new URL(h, base).href; } catch { return null; }
    }).filter(Boolean);
}

/**
 * Where to look for contact details: a contact link on the homepage (Shopify uses /pages/contact),
 * else /contact; an about link, else /about. At most one of each, same site only.
 */
export function enrichmentTargets($, base) {
    const origin = new URL(base).origin;
    const site = new URL(base).hostname.replace(/^www\./, '');
    // A link counts when its path says so (/pages/contact, /about-us) or its label is just that
    // ("Contact us", "Our story"), not a sentence that mentions it ("Learn more about rewards").
    const find = (labelRe, pathRe) => {
        let hit = null;
        $('a[href]').each((_, el) => {
            if (hit) return;
            const href = $(el).attr('href') ?? '';
            const label = $(el).text().replace(/\s+/g, ' ').trim();
            let path = '';
            try { path = new URL(href, base).pathname; } catch { return; }
            if (!pathRe.test(path) && !(label.length <= 30 && labelRe.test(label))) return;
            try {
                const u = new URL(href, base);
                if (/^https?:$/.test(u.protocol) && u.hostname.replace(/^www\./, '') === site && u.pathname !== '/') { u.hash = ''; hit = u.href; }
            } catch { /* ignore */ }
        });
        return hit;
    };
    return {
        contact: find(/^(contact|contact us|get in touch|help (&|and) contact|customer service)$/i, /\/(pages\/)?contact(?:[-_]?us)?\/?$/i) ?? `${origin}/contact`,
        about: find(/^(about|about us|our story|who we are|company)$/i, /\/(pages\/)?(about(?:[-_]?us)?|our[-_]story)\/?$/i) ?? `${origin}/about`,
    };
}
