import { createEffect, createSignal } from 'solid-js';

// A two-phase effect whose apply only writes a local signal — the "signal +
// effect that syncs it" pattern from rule 4, in both apply shapes.
export function OrganizerBadge(props: { organizer: () => number | null }) {
  const [signInError, setSignInError] = createSignal<string | null>('sign in first');

  createEffect(
    () => props.organizer(),
    (id) => {
      if (id !== null) setSignInError(null);
    },
  );

  createEffect(
    () => props.organizer(),
    (id) => setSignInError(id !== null ? null : 'sign in first'),
  );

  return <p>{signInError()}</p>;
}
