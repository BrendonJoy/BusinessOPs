import type { MetadataRoute } from 'next'

/**
 * Web app manifest — what turns BusinessOps from a bookmark into something that
 * installs to a phone home screen.
 *
 * `display: standalone` is the point of it: the app opens with no address bar
 * and no browser toolbar, which reclaims roughly 15% of vertical screen space.
 * That matters on a job-site form far more than it does at a desk.
 *
 * This is the shell only. It does NOT make the app work offline — that needs a
 * service worker plus a local write queue, and is a separate piece of work.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'BusinessOps',
    short_name: 'BusinessOps',
    description: 'Job, staff, and cost management for tradespeople.',
    start_url: '/dashboard',
    // Signing in is the first thing an uninstalled user does, and the app is
    // useless signed out, so scope covers the whole origin.
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    // Matches the dark palette so the splash screen doesn't flash white before
    // the app paints.
    background_color: '#0a0a0c',
    theme_color: '#0a0a0c',
    categories: ['business', 'productivity'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      // Android crops launcher icons to whatever shape the device uses. The
      // maskable variant is inset so that crop can't clip the mark.
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
