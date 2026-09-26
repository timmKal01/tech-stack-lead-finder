# Pricing proposal: tech-stack-lead-finder

Not set on Apify yet. For review.

## Proposal

| Event | Price | Charged when |
|---|---|---|
| `matched-site` | **$0.007** ($7 per 1,000 matching sites) | Once per site that passes the filters |

Non-matching, blocked and unreachable sites are free. No start fee.

## Reasoning

**It's a lead, not a lookup.** A matched row is a qualified prospect (the stack you asked for, plus published emails, phones and socials). Pure detectors are priced per URL checked; lead finders are priced per lead. Apify Store, 2026-09-26 (Free-tier price):

| Actor | Users | Price |
|---|---|---|
| clearpath/shopify-store-leads | 1,613 | $0.006 per store lead |
| nexgendata/wappalyzer-replacement | 1,466 | $0.10 per detection |
| builtwith/builtwith-official-technology-scraper | 648 | $0.002 per item |
| automation-lab/tech-stack-detector | 364 | $0.0023 per URL |
| parsebird/shopify-store-leads-scraper | 126 | $0.0037 per store |
| tugelbay/website-tech-stack-detector | 109 | $0.003 per item |

$0.007 matches the portfolio convention and sits next to the most-used lead scraper ($0.006), while charging nothing for the sites that don't match. A user checking 1,000 domains for "Shopify without Klaviyo" might get 150 matches and pay about $1.05.

**Cost to run (paid by us under pay-per-event):** small. A domain costs 1 request if it doesn't match, up to 3 plus robots.txt if it does. At 256 MB and five domains at a time, 1,000 domains is roughly 5 to 10 minutes, about 0.02 to 0.04 compute units. Free non-matches cost fractions of a cent per thousand.

**Relation to website-tech-stack-detector:** that actor is untouched and keeps its own pricing. This one is the lead-generation version: bulk, filtered, enriched, and billed only on matches.

**Empty-input run:** 5 of the 10 example domains match, so a first click costs $0.035.
