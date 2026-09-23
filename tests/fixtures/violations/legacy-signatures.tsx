import { createEffect, createMemo, createProjection, createSignal } from 'solid-js';

const [count] = createSignal(0);

// Solid 1.x signatures: one-argument effect, effect with an initial value,
// memo with an initial value (with and without options).
createEffect(() => {
  console.log(count());
});
createEffect((prev) => prev + count(), 0);
const doubled = createMemo(() => count() * 2, 0);
const labelled = createMemo((prev) => `${prev}${count()}`, '', { name: 'label' });

// createProjection returns the store, not a tuple.
const [rows] = createProjection<{ id: string }[]>((draft) => {
  draft.push({ id: String(count()) });
}, []);

// A local component named Meta is not Solid Meta: its `key` is still React's.
function Meta(props: { name: string }) {
  return <meta name={props.name} />;
}

export function View() {
  return (
    <>
      <input use:autofocus />
      <Meta key={'x'} name="description" />
      <p>{String(doubled()) + labelled() + rows.id}</p>
    </>
  );
}
