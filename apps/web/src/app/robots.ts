import type { MetadataRoute } from 'next'

/**
 * `app.joytech.nz` is entirely a signed-in application. Nothing on this host is
 * meant to be found in a search engine — not the login page, and emphatically
 * not `/q/[token]`, where a public quote link would expose a customer's name,
 * address and prices to anyone who searched for them.
 *
 * The future marketing site lives on the apex domain and serves its own
 * robots.txt, so blocking everything here costs no discoverability.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      disallow: '/',
    },
  }
}
