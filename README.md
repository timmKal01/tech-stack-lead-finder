# Tech Stack Lead Finder: Shopify, Klaviyo & 120+ Technologies

Give it a list of domains. It checks each homepage for **124 technologies** (ecommerce platforms, email and SMS marketing, analytics, live chat, payments, reviews, A/B testing, CMS, frameworks, hosting), keeps only the sites that match the stack you're looking for, and adds the **business emails, phone numbers and social profiles those sites publish**. The result is a lead list you can use straight away.

Typical searches:

- Shopify stores **not** using Klaviyo (an email tool's prospects)
- WooCommerce or BigCommerce stores using Klarna or Afterpay
- Sites running Intercom or Drift (a chat competitor's prospects)
- Stores on Shopify with Yotpo reviews but no Attentive SMS

## Who it's for

- **SaaS sales and agencies** building prospect lists by technology: "stores on X without Y".
- **App and plugin makers** finding stores on a platform to pitch an integration.
- **Market researchers** measuring who uses what across a list of domains.

## How it works

1. **Detect.** One request per domain, to the homepage. Technologies are recognised from response headers, cookies, meta tags, script and stylesheet URLs, and page markup.
2. **Filter.** `requireAll`, `requireAny` and `exclude` decide which sites are matches.
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
| `includeNonMatches` | Also output non-matching and unreachable sites, with the reason. Free. |
| `maxItems` | Stop after this many matching sites. |

Technology names are forgiving (`woocommerce`, `Google Analytics`, `GA4`, `nextjs` all work). A misspelt name stops the run with the list of valid names, so a typo never silently matches nothing. With no filters at all, every site that loads counts as a match.

## Output

A real row from the default run (2026-09-26):

```json
{
  "domain": "brooklinen.com",
  "matched": true,
  "status": "ok",
  "technologies": [
    { "name": "Shopify", "category": "ecommerce", "confidence": "high", "evidence": "header: powered-by: Shopify" },
    { "name": "Google Analytics", "category": "analytics", "confidence": "medium", "evidence": "script: googletagmanager.com/gtag/js" },
    { "name": "Yotpo", "category": "reviews", "confidence": "medium", "evidence": "html: cdn-widgetsrepository.yotpo.com" },
    { "name": "Cloudflare", "category": "cdn-hosting", "confidence": "high", "evidence": "header: cf-ray" },
    { "name": "OneTrust", "category": "consent", "confidence": "medium", "evidence": "script: cdn.cookielaw.org" }
  ],
  "matchedFilters": { "requireAll": [], "requireAny": ["Shopify"], "excluded": [] },
  "emails": ["hello@brooklinen.com", "press@brooklinen.com", "sales@brooklinenbusiness.com", "influencer@brooklinen.com"],
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
  "pagesChecked": [
    { "url": "https://brooklinen.com/", "result": "ok" },
    { "url": "https://www.brooklinen.com/pages/contact", "result": "ok" },
    { "url": "https://www.brooklinen.com/pages/about", "result": "ok" }
  ],
  "sourceUrl": "https://www.brooklinen.com/",
  "scrapedAt": "2026-09-26T00:35:08.040Z"
}
```

### Confidence

| Level | Based on |
|---|---|
| `high` | A response header, cookie or generator meta tag the technology sets (e.g. Shopify's `powered-by` header) |
| `medium` | A script or stylesheet loaded from the technology's own domain (e.g. `static.klaviyo.com`) |
| `low` | A weaker markup hint |

`evidence` shows exactly what was matched, so you can check any detection.

### Contact details

- **Emails** come from `mailto:` links and the visible page text, including spellings like `info [at] domain [dot] com`. Role addresses (`info@`, `sales@`, `hello@`, `support@`...) are listed first. Addresses are never guessed or generated: if a site only offers a contact form or a help desk on another domain, `emails` is empty.
- **Phones** come from `tel:` links and numbers in an unambiguous format (international `+` numbers, or North American `(xxx) xxx-xxxx` / `xxx-xxx-xxxx`). Order numbers, dates and prices are not mistaken for phones.
- **Socials**: the site's own LinkedIn company page, X, Instagram, Facebook, YouTube and TikTok profiles. Share buttons and individual posts are ignored.
- **Language** is the page's declared language (`<html lang>`).

### Status values

`ok`, `blocked` (bot protection page), `robots_disallowed`, `unreachable` (DNS or connection failure), `not_found`, `server_error`, `rate_limited`. Non-`ok` sites never match and are only output with `includeNonMatches`.

## What it detects

Ecommerce (Shopify, WooCommerce, BigCommerce, Magento, Salesforce Commerce Cloud, PrestaShop, Shopware, Ecwid, OpenCart), email and SMS marketing (Klaviyo, Mailchimp, Omnisend, Brevo, Kit, Drip, MailerLite, Constant Contact, Attentive, Postscript, Privy), marketing automation (HubSpot, Marketo, Pardot, ActiveCampaign, Customer.io), analytics and pixels (Google Analytics, Tag Manager, Meta, TikTok, Pinterest, LinkedIn, X and Snap pixels, Hotjar, Clarity, Segment, Mixpanel, Amplitude, Heap, PostHog, FullStory, Plausible, Fathom, Matomo), live chat (Intercom, Drift, Crisp, Tawk.to, Zendesk, LiveChat, Tidio, Gorgias, Olark, Freshchat, Help Scout), payments (Stripe, PayPal, Shop Pay, Klarna, Afterpay, Affirm, Sezzle, Square, Braintree, Amazon Pay), reviews (Yotpo, Judge.me, Okendo, Trustpilot, Stamped, Loox, REVIEWS.io, Bazaarvoice), A/B testing (Optimizely, VWO, AB Tasty, Convert, Kameleoon, LaunchDarkly), CMS (WordPress, Drupal, Joomla, Wix, Squarespace, Webflow, Ghost, HubSpot CMS, Framer, Contentful, Sanity, Weebly, Craft CMS, TYPO3), frameworks (Next.js, Nuxt, Gatsby, Remix, Astro, SvelteKit, React, Vue.js, Angular, jQuery, Alpine.js, Tailwind CSS, Bootstrap), hosting and CDN (Cloudflare, Vercel, Netlify, CloudFront, Fastly, Akamai, GitHub Pages, Heroku, Fly.io, Render), search (Algolia, Klevu, Searchspring), consent (OneTrust, Cookiebot), subscriptions and loyalty (Recharge, Smile.io).

Detection reads the homepage as served, so tools loaded only after a click or on other pages (a checkout script, a chat widget injected late by a tag manager) can be missed.

## FAQ

**Where do I get domains?** Your CRM, a conference exhibitor list, a directory export, or another actor's output. This actor checks the domains you give it; it doesn't discover new ones.

**How fast is it?** About 1 to 3 seconds per domain, five domains at a time, one request per second per site.

**Is the contact data legal to use?** It's what each business publishes on its own site for people to contact it. How you use it (cold email rules like CAN-SPAM, GDPR and PECR) is your responsibility.

## Pricing

Pay per matching site only. Non-matching, blocked and unreachable sites are free.

## Disclaimer

This actor is unofficial and is not affiliated with, endorsed by, or connected to BuiltWith, Wappalyzer, Shopify or any technology vendor or website it detects. Trademarks belong to their owners.
