// Plain HTTP for website pages: timeout, one polite request at a time per host, retry with
// exponential backoff on 429/5xx, and results categorized by status instead of thrown.
// Bot walls (Cloudflare challenge, Vercel checkpoint, DataDome, ...) are reported as
// "blocked" and never retried or worked around.
import { log } from 'apify';

export const USER_AGENT = 'tech-stack-lead-finder/0.1 (+https://apify.com/m_ctim/tech-stack-lead-finder)';

const TIMEOUT_MS = 20_000;
const MAX_ATTEMPTS = 3;
const HOST_GAP_MS = 1000;
const MAX_BYTES = 6_000_000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hostQueues = new Map();

function waitForHost(host) {
    const prev = hostQueues.get(host) ?? Promise.resolve();
    hostQueues.set(host, prev.then(() => sleep(HOST_GAP_MS)).catch(() => {}));
    return prev;
}

export function categorize(status) {
    if (status >= 200 && status < 300) return 'ok';
    if (status === 404 || status === 410) return 'not_found';
    if (status === 401 || status === 403) return 'blocked';
    if (status === 429) return 'rate_limited';
    if (status >= 500) return 'server_error';
    return 'client_error';
}

const CHALLENGE_RE = /<title>\s*(just a moment\.\.\.|attention required! \| cloudflare|vercel security checkpoint|access denied|pardon our interruption|are you a robot|security check)|captcha-delivery\.com|px-captcha|_incapsula_resource|cf-browser-verification/i;
// Not "challenge-platform": Cloudflare adds that script to ordinary pages too.

/** True when a response is a bot wall rather than the site. */
export function isChallenge(status, headers, body) {
    if (/challenge/i.test(headers['cf-mitigated'] ?? '')) return true;
    if (headers['x-vercel-mitigated'] === 'challenge') return true;
    return status !== 404 && CHALLENGE_RE.test(String(body ?? '').slice(0, 20_000));
}

/**
 * @returns {Promise<{ok: boolean, status: number, category: string, url: string, finalUrl?: string,
 *   headers?: Record<string,string>, setCookies?: string[], body?: string, error?: string}>}
 */
export async function getPage(url, { accept = 'text/html,application/xhtml+xml' } = {}) {
    const host = new URL(url).host;
    let last = { ok: false, status: 0, category: 'network_error', url };
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        await waitForHost(host);
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
        try {
            const res = await fetch(url, {
                headers: { 'User-Agent': USER_AGENT, Accept: accept, 'Accept-Language': 'en' },
                redirect: 'follow',
                signal: controller.signal,
            });
            const headers = Object.fromEntries([...res.headers.entries()].map(([k, v]) => [k.toLowerCase(), v]));
            const setCookies = res.headers.getSetCookie?.() ?? [];
            const type = headers['content-type'] ?? '';
            const readable = !type || /html|text|xml/i.test(type);
            const body = readable ? (await res.text()).slice(0, MAX_BYTES) : (await res.body?.cancel().catch(() => {}), '');
            const base = { status: res.status, url, finalUrl: res.url, headers, setCookies };
            if (isChallenge(res.status, headers, body)) return { ...base, ok: false, category: 'blocked', error: 'Bot protection page' };
            const category = categorize(res.status);
            if (category === 'ok') {
                if (!readable) return { ...base, ok: false, category: 'not_html' };
                return { ...base, ok: true, category, body };
            }
            last = { ...base, ok: false, category };
            if (category !== 'rate_limited' && category !== 'server_error') return last;
            const retryAfter = Number(headers['retry-after']);
            if (attempt < MAX_ATTEMPTS) await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 20) * 1000 : 1000 * 2 ** attempt);
        } catch (err) {
            last = { ok: false, status: 0, category: 'network_error', url, error: err.name === 'AbortError' ? `Timed out after ${TIMEOUT_MS / 1000}s` : (err.cause?.code ?? err.message) };
            // DNS failures and refused connections won't fix themselves in a few seconds.
            if (/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|CERT|SSL/i.test(last.error)) return last;
            if (attempt < MAX_ATTEMPTS) await sleep(1000 * 2 ** attempt);
        } finally {
            clearTimeout(timer);
        }
    }
    log.debug(`Giving up on ${url}`, last);
    return last;
}
