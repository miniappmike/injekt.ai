/**
 * Pacing for batches. Image starts are limited to 12 a minute, so "Generate all" starts one image every 5 seconds
 * (never all at once, which hit the limit and left a Chromebook tab busy with many jobs at the same moment). Prompt
 * writing for many target photos pauses a moment between photos, so the writing and overlay-cleanup calls (20 a
 * minute together) never bunch up.
 */
export const GENERATE_STAGGER_MS = 5000;
export const WRITE_STAGGER_MS = 2000;
/** When the n-th image of a batch should start, in milliseconds after the button was pressed. */
export const staggerDelay = (n: number) => Math.max(0, n) * GENERATE_STAGGER_MS;
