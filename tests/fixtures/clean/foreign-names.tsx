import { createEffect } from 'effector';

// effector's createEffect takes one handler; the name is not Solid's here.
export const saveFx = createEffect(async (id: string) => id);

// A local helper that shares Solid's name is its own signature.
function createMemo<T>(compute: () => T, fallback: T, label: string) {
  return compute() ?? fallback ?? label;
}
export const total = createMemo(() => 1, 0, 'total');

// Object keys and `data-` attributes are not Solid 1.x JSX namespaces.
export const flags = { on:true };
export const Marker = () => <div data-use:marker="1" />;
