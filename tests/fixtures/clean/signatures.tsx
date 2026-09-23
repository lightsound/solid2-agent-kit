import { createEffect, createMemo, createProjection, createSignal, type MemoOptions } from 'solid-js';
import { Meta, Title as PageTitle } from '@solidjs/meta';

const [count] = createSignal(0);
const options: MemoOptions<number> = { name: 'doubled' };

// Solid 2 signatures: compute + apply, the effect bundle, an options object or
// identifier as the memo's second argument, and trailing commas.
createEffect(
  () => count(),
  (value) => {
    console.log(value);
  },
);
createEffect(() => count(), {
  effect: (value) => {
    console.log(value);
  },
  error: (err) => {
    console.error(err);
  },
});
const doubled = createMemo(() => count() * 2, { name: 'doubled' });
const tripled = createMemo(() => count() * 3, options);
const running = createMemo((prev: number = 0) => prev + count());

const [selectedId] = createSignal('a');
const isSelected = createProjection<Record<string, boolean>>((draft) => {
  for (const key of Object.keys(draft)) delete draft[key];
  draft[selectedId()] = true;
}, {});

// `prop:` is still a Solid 2 namespace; Solid Meta tags take `key` as their identity.
export function Head(props: { mixed: boolean; image: string }) {
  return (
    <>
      <PageTitle key={'title'}>{String(doubled() + tripled() + running())}</PageTitle>
      <Meta key={'social-image'} property="og:image" content={props.image} />
      <input type="checkbox" prop:indeterminate={props.mixed} checked={isSelected.a} />
    </>
  );
}
