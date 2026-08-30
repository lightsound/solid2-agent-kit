import { createEffect, createSignal, type Element } from 'solid-js';
import type { JSX } from '@solidjs/web';

function setDocumentTitle(title: string) {
  document.title = title;
}

// Writable derivation (reset on source change), a legit two-phase effect that
// pushes into a non-Solid system, and an external set*-named function in an
// apply phase — none of these may trip `effect-sync-signal`. The `JSX` type
// import from "@solidjs/web" (not "solid-js") must not trip
// `jsx-namespace-import`.
export function ThemeLabel(props: {
  theme: () => string;
  icon?: Element;
  style?: JSX.CSSProperties;
}) {
  const [label, setLabel] = createSignal<string | null>(() => {
    props.theme();
    return null;
  });

  createEffect(
    () => props.theme(),
    (theme) => {
      document.documentElement.dataset.theme = theme;
    },
  );

  createEffect(
    () => label(),
    (text) => setDocumentTitle(text ?? ''),
  );

  return (
    <span style={props.style} onDblClick={() => setLabel('renamed')}>
      {props.icon}
      {label()}
    </span>
  );
}
