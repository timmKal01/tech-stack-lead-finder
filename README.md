# Tech Stack Detector & Lead Finder: Wappalyzer Alternative

Give it a list of domains. It checks each homepage for **124 technologies** (ecommerce platforms, email and SMS marketing, analytics, live chat, payments, reviews, A/B testing, CMS, frameworks, hosting) and works two ways:

- **Detect:** leave the filters empty and get every site's full tech stack, one row per site, grouped by category (CMS, ecommerce, analytics, hosting...) with the server headers. Like Wappalyzer, for a whole list at once.
- **Find leads:** set filters ("Shopify but not Klaviyo") to keep only the sites that match, with the **business emails, phone numbers and social profiles those sites publish**. The result is a lead list you can use straight away.

Typical lead searches:

- Shopify stores **not** using Klaviyo (an email tool's prospects)
- WooCommerce or BigCommerce stores using Klarna or Afterpay
- Sites running Intercom or Drift (a chat competitor's prospects)
- Stores on Shopify with Yotpo reviews but no Attentive SMS

## Who it's for

- **SaaS sales and agencies** building prospect lists by technology: "stores on X without Y".
- **App and plugin makers** finding stores on a platform to pitch an integration.
- **Market researchers** measuring who uses what across a list of domains.
- **Developers, SEO and security teams** checking what a list of sites runs on: CMS, framework, CDN, server.

## Check any site's tech stack

Leave `requireAll`, `requireAny` and `exclude` empty, and every domain gets a row: sites that loaded with their technologies, and sites that couldn't be checked with the reason (those rows are free).

```json
{
  "domains": ["techcrunch.com", "notion.com", "ghost.org"],
  "requireAny": []
}
```

Part of the techcrunch.com row from that run (2026-11-13). `stack` always has all 17 categories; the empty ones are left out here:

```json
{
  "rowType": "site",
  "domain": "techcrunch.com",
  "status": "ok",
  "error": null,
  "technologies": [
    { "name": "WordPress", "category": "cms", "confidence": "high", "evidence": "meta: generator: WordPress 6.9.11" },
    { "name": "Google Tag Manager", "category": "tag-manager", "confidence": "medium", "evidence": "html: googletagmanager.com/gtm.js?id=" },
    { "name": "Cloudflare", "category": "cdn-hosting", "confidence": "high", "evidence": "header: cf-ray" }
  ],
  "stack": {
    "cms": ["WordPress"],
    "tagManagers": ["Google Tag Manager"],
    "cdnHosting": ["Cloudflare"]
  },
  "server": "cloudflare",
  "poweredBy": "WordPress VIP <https://wpvip.com>",
  "generator": "WordPress 6.9.11"
}
```

`server`, `poweredBy` and `generator` are what the site itself states, so they show tools that aren't on the list of 124. In the same run, ghost.org's generator tag said `Hugo 0.119.0`. The Output tab has a **Tech stack** view with one column per category.

## How it works

1. **Detect.** One request per domain, to the homepage. Technologies are recognised from response headers, cookies, meta tags, script and stylesheet URLs, and page markup.
2. **Filter.** `requireAll`, `requireAny` and `exclude` decide which sites are matches. With no filters, every site that loads is a match.
3. **Enrich (matches only).** At most two more pages: the contact page (the site's own "Contact" link, or `/contact`) and the about page. Emails, phone numbers and social links are read from those and the homepage.

robots.txt is checked before every page. Sites behind a bot wall (a Cloudflare challenge, Vercel checkpoint and the like) are reported as `blocked` and skipped; the actor never tries to get around them. No proxies, no browser, no logins.

## Input examples

The default: 10 real domains, keeping the Shopify stores (5 match).

```json
{
  "domains": ["allbirds.com", "colourpop.com", "kyliecosmetics.com", "brooklinen.com", "skullcandy.com",
              "wordpress.org", "woocommerce.com", "basecamp.com", "ghost.org", "prestashop.com"],
  "requireAny": ["Shopify"]
}
```

Shopify stores that don't use Klaviyo:

```json
{
  "domains": ["allbirds.com", "colourpop.com", "kyliecosmetics.com", "brooklinen.com", "skullcandy.com"],
  "requireAll": ["Shopify"],
  "exclude": ["Klaviyo"]
}
```

Any store platform with buy-now-pay-later, and a record of every site checked:

```json
{
  "domains": ["..."],
  "requireAny": ["Shopify", "WooCommerce", "BigCommerce", "Magento"],
  "requireAll": ["Klarna"],
  "includeNonMatches": true
}
```

## Input fields

| Field | What it does |
|---|---|
| `domains` | Domains or URLs, one per line. Only the domain is used. |
| `requireAll` | Site must use every one of these. |
| `requireAny` | Site must use at least one of these. |
| `exclude` | Site must use none of these. |
| `enrich` | Read contact and about pages for emails, phones and socials. On by default. |
| `includeNonMatches` | Also output non-matching and unreachable sites, with the reason. Free. Automatic when no filters are set. |
| `maxItems` | Stop after this many matching sites. |

Technology names are forgiving (`woocommerce`, `Google Analytics`, `GA4`, `nextjs` all work). A misspelt name stops the run with the list of valid names, so a typo never silently matches nothing. With no filters at all, every site that loads counts as a match. An entry that isn't a domain at all gets a free `error` row saying so.

## Output

A real row from the default run (local run, 2026-11-13):

```json
{
  "rowType": "site",
  "domain": "brooklinen.com",
  "matched": true,
  "status": "ok",
  "error": null,
  "technologies": [
    {"name": "Shopify", "category": "ecommerce", "confidence": "high", "evidence": "header: powered-by: Shopify"},
    {"name": "Google Analytics", "category": "analytics", "confidence": "medium", "evidence": "script: googletagmanager.com/gtag/js"},
    {"name": "Yotpo", "category": "reviews", "confidence": "medium", "evidence": "html: cdn-widgetsrepository.yotpo.com"},
    {"name": "Cloudflare", "category": "cdn-hosting", "confidence": "high", "evidence": "header: cf-ray"},
    {"name": "OneTrust", "category": "consent", "confidence": "medium", "evidence": "script: cdn.cookielaw.org"}
  ],
  "stack": {
    "cms": [],
    "ecommerce": ["Shopify"],
    "frameworks": [],
    "analytics": ["Google Analytics"],
    "tagManagers": [],
    "marketingAutomation": [],
    "emailMarketing": [],
    "smsMarketing": [],
    "liveChat": [],
    "payments": [],
    "reviews": ["Yotpo"],
    "abTesting": [],
    "cdnHosting": ["Cloudflare"],
    "search": [],
    "consent": ["OneTrust"],
    "subscriptions": [],
    "loyalty": []
  },
  "matchedFilters": {
    "requireAll": [],
    "requireAny": ["Shopify"],
    "excluded": []
  },
  "emails": ["hello@brooklinen.com", "press@brooklinen.com", "influencer@brooklinen.com", "sales@brooklinenbusiness.com"],
  "phones": ["646-798-7447"],
  "socials": {
    "facebook": "https://www.facebook.com/Brooklinen",
    "x": "https://x.com/brooklinen",
    "instagram": "https://www.instagram.com/brooklinen"
  },
  "title": "Luxury Bedding, Sheets & Comforters Online | Brooklinen",
  "description": "Discover Brooklinen’s premium bedding collection. Shop soft sheets, cozy comforters, and soft & firm supportive pillows designed for the best night’s sleep.",
  "language": "en",
  "httpStatus": 200,
  "server": "cloudflare",
  "poweredBy": null,
  "generator": null,
  "pagesChecked": [
    {"url": "https://brooklinen.com/", "result": "ok"},
    {"url": "https://www.brooklinen.com/pages/contact", "result": "ok"},
    {"url": "https://www.brooklinen.com/pages/about", "result": "ok"}
  ],
  "sourceUrl": "https://www.brooklinen.com/",
  "scrapedAt": "2026-11-12T23:09:28.879Z"
}
```

`rowType` is `"site"`. A site that couldn't be checked comes back as `"error"` with the reason in `error` (with no filters, or with `includeNonMatches`). A run that saves nothing returns one free `"note"` row saying why, for example how many sites loaded but didn't match your filters.

### Confidence

| Level | Based on |
|---|---|
| `high` | A response header, cookie or generator meta tag the technology sets (e.g. Shopify's `powered-by` header) |
| `medium` | A script or stylesheet loaded from the technology's own domain (e.g. `static.klaviyo.com`) |
| `low` | A weaker markup hint |

`evidence` shows exactly what was matched, so you can check any detection.

### Contact details

- **Emails** come from `mailto:` links and the visible page text, including spellings like `info [at] domain [dot] com`. Only the business's own addresses are kept: generic mailboxes (`info@`, `sales@`, `hello@`, `press@`, `support@`...) and addresses that carry the site's name (`sales@brooklinenbusiness.com`, `brooklinen@gmail.com`). An address that looks like one person's own mailbox (`jane.smith@...`) is left out, even when the site publishes it, and so is a third party's address (a help desk vendor's). Addresses are never guessed or generated: if a site only offers a contact form, `emails` is empty.
- **Phones** come from `tel:` links and numbers in an unambiguous format (international `+` numbers, or North American `(xxx) xxx-xxxx` / `xxx-xxx-xxxx`). Order numbers, dates and prices are not mistaken for phones.
- **Socials**: the site's own LinkedIn company page, X, Instagram, Facebook, YouTube and TikTok profiles. Share buttons and individual posts are ignored.
- **Language** is the page's declared language (`<html lang>`).

### Status values

`ok`, `blocked` (bot protection page), `robots_disallowed`, `unreachable` (DNS or connection failure, or no answer in 20 seconds), `not_found`, `server_error`, `rate_limited`, `client_error`, `not_html`, `invalid_input` (the entry isn't a domain). Non-`ok` sites never match and are never charged. They're output when no filters are set, or with `includeNonMatches`.

## What it detects

Ecommerce (Shopify, WooCommerce, BigCommerce, Magento, Salesforce Commerce Cloud, PrestaShop, Shopware, Ecwid, OpenCart), email and SMS marketing (Klaviyo, Mailchimp, Omnisend, Brevo, Kit, Drip, MailerLite, Constant Contact, Attentive, Postscript, Privy), marketing automation (HubSpot, Marketo, Pardot, ActiveCampaign, Customer.io), analytics and pixels (Google Analytics, Tag Manager, Meta, TikTok, Pinterest, LinkedIn, X and Snap pixels, Hotjar, Clarity, Segment, Mixpanel, Amplitude, Heap, PostHog, FullStory, Plausible, Fathom, Matomo), live chat (Intercom, Drift, Crisp, Tawk.to, Zendesk, LiveChat, Tidio, Gorgias, Olark, Freshchat, Help Scout), payments (Stripe, PayPal, Shop Pay, Klarna, Afterpay, Affirm, Sezzle, Square, Braintree, Amazon Pay), reviews (Yotpo, Judge.me, Okendo, Trustpilot, Stamped, Loox, REVIEWS.io, Bazaarvoice), A/B testing (Optimizely, VWO, AB Tasty, Convert, Kameleoon, LaunchDarkly), CMS (WordPress, Drupal, Joomla, Wix, Squarespace, Webflow, Ghost, HubSpot CMS, Framer, Contentful, Sanity, Weebly, Craft CMS, TYPO3), frameworks (Next.js, Nuxt, Gatsby, Remix, Astro, SvelteKit, React, Vue.js, Angular, jQuery, Alpine.js, Tailwind CSS, Bootstrap), hosting and CDN (Cloudflare, Vercel, Netlify, CloudFront, Fastly, Akamai, GitHub Pages, Heroku, Fly.io, Render), search (Algolia, Klevu, Searchspring), consent (OneTrust, Cookiebot), subscriptions and loyalty (Recharge, Smile.io).

Detection reads the homepage as served, so tools loaded only after a click or on other pages (a checkout script, a chat widget injected late by a tag manager) can be missed.

## FAQ

**Where do I get domains?** Your CRM, a conference exhibitor list, a directory export, or another actor's output. This actor checks the domains you give it; it doesn't discover new ones.

**How fast is it?** About 1 to 3 seconds per domain, five domains at a time, one request per second per site.

**Is the contact data legal to use?** It's what each business publishes on its own site for people to contact it. How you use it (cold email rules like CAN-SPAM, GDPR and PECR) is your responsibility.

## Pricing

Pay per matching site only. With no filters, every site that loads counts as a match. Non-matching, blocked and unreachable sites, invalid entries and the note row are free.

## Related tools

- [Website Gap Finder](https://apify.com/m_ctim/website-gap-finder): local businesses from Google Maps with no website, or a broken or outdated one, each with a website audit, a lead score and a pitch line

## Disclaimer

This actor is unofficial and is not affiliated with, endorsed by, or connected to BuiltWith, Wappalyzer, Shopify or any technology vendor or website it detects. Trademarks belong to their owners.
