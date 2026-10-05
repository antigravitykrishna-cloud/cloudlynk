import type { Href } from 'expo-router';

// Where to land after the next sign-in, e.g. the plan a guest picked before being asked to sign in.
// Kept in memory only, so it never resurfaces after an app restart.
let pending: Href | null = null;

export function setPostLoginRoute(route: Href | null) {
  pending = route;
}

/**
 * Reads the pending destination without clearing it. The routing effect in
 * app/_layout.tsx can run more than once before navigation settles, and a
 * value consumed on the first run would send the second run to Explore.
 */
export function peekPostLoginRoute(): Href | null {
  return pending;
}
