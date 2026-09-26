/** "https://www.Example.com/shop?x=1" -> "www.example.com"; junk -> null. */
export function normalizeDomain(raw) {
    const s = String(raw ?? '').trim();
    if (!s) return null;
    try {
        const u = new URL(/^[a-z]+:\/\//i.test(s) ? s : `https://${s}`);
        const host = u.hostname.toLowerCase().replace(/\.$/, '');
        return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) ? host : null;
    } catch {
        return null;
    }
}
