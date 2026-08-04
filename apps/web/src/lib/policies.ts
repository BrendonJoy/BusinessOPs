/**
 * Versioned policy documents.
 *
 * The version is the date the wording last changed. When you edit the privacy
 * notice you MUST bump this — the acceptance record stores whatever value is
 * here at the moment someone signs up, and a record pointing at a version that
 * no longer matches the text they saw is worse than no record, because it looks
 * like evidence.
 *
 * Terms of service are deliberately absent. `policy_acceptances` already
 * accepts a 'terms' document and `handle_new_user` already records one if the
 * version is present, so wiring them up later is a form field and a constant —
 * no migration. They are not here yet because there is no terms text to accept,
 * and recording that someone agreed to a document that does not exist would be
 * a false record rather than a missing one.
 */

export const PRIVACY_NOTICE_VERSION = '2026-08-04'

export const POLICY_PATHS = {
  privacy: '/legal/privacy',
} as const
