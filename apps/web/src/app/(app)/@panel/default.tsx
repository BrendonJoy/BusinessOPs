/**
 * Fallback for the @panel slot.
 *
 * Required: on a hard navigation or refresh Next cannot recover a slot's active
 * state, and without a default it renders a 404 instead. Returning null means
 * "no panel", which is correct for every route that isn't an intercepted one —
 * and for /jobs/[id] loaded directly, where the full page should render.
 */
export default function PanelDefault() {
  return null
}
