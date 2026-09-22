import type { Href } from 'expo-router';

// Where to land after the next successful sign-in.
//
// A guest who taps a plan on the Profile tab is sent to /(auth)/login first.
// Without this, app/_layout.tsx drops every fresh sign-in on Explore, so the
// person has to go back and find the plan they had already picked -- the
// point in the funnel where losing them is most expensive.
//
// Module state, not storage: it only has to survive the in-app hop through
// login and complete-profile, and a destination that outlived an app restart
// would ambush someone days later.
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
