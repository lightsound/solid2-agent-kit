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

// Near-misses for solid1-lowercase-event: ordinary identifiers, HTML strings,
// a string inline-handler attribute, and a custom attribute that only starts
// with `on` are not JSX event props and must not be flagged.
const onmessage = (e: MessageEvent) => e.data;
let onerror: ((e: Event) => void) | null = null;
const socket = { onmessage: null as null | ((e: MessageEvent) => void), onerror: null as null | ((e: Event) => void) };
socket.onmessage = onmessage;
socket.onerror = onerror;
const html = `<img onerror="this.remove()">`;
void html;
export const Tracked = () => <button type="button" onclick={"track('cta')"} one={1}>go</button>;
