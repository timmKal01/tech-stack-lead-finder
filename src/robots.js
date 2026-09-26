// robots.txt, copied from ats-jobs-aggregator/src/detect.js.

/**
 * Minimal robots.txt reader for the `*` group (this actor has no named group anywhere).
 * Longest matching rule wins; Allow wins ties. Supports `*` and `$` in paths.
 */
export function parseRobots(txt) {
    const groups = [];
    let current = null;
    let lastWasAgent = false;
    for (const rawLine of String(txt ?? '').split(/\r?\n/)) {
        const line = rawLine.replace(/#.*/, '').trim();
        const m = line.match(/^([a-z-]+)\s*:\s*(.*)$/i);
        if (!m) continue;
        const key = m[1].toLowerCase();
        const value = m[2].trim();
        if (key === 'user-agent') {
            if (!lastWasAgent) { current = { agents: [], rules: [] }; groups.push(current); }
            current.agents.push(value.toLowerCase());
            lastWasAgent = true;
            continue;
        }
        lastWasAgent = false;
        if (!current) continue;
        if (key === 'allow' || key === 'disallow') current.rules.push({ allow: key === 'allow', path: value });
    }
    return groups.filter((g) => g.agents.includes('*')).flatMap((g) => g.rules);
}

function ruleRegex(p) {
    const anchored = p.endsWith('$');
    const body = (anchored ? p.slice(0, -1) : p).split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*');
    return new RegExp(`^${body}${anchored ? '$' : ''}`);
}

export function isAllowed(rules, path) {
    let best = null;
    for (const r of rules) {
        if (!r.path) continue; // "Disallow:" with no path allows everything
        if (!ruleRegex(r.path).test(path)) continue;
        if (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow)) best = r;
    }
    return best ? best.allow : true;
}
