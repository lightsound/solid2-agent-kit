// Deprecated @solidjs/router names (2.0.0-next.41): `action` / `Action` are
// aliases of `formAction` / `FormAction`, and `useAction` has no replacement.
import { action as formAlias, useAction, type Action } from '@solidjs/router';
export { action as legacySave } from '@solidjs/router/data';
const action = formAlias;

export const save = action(async (form: FormData) => String(form.get('note') ?? ''), 'save');
export type Save = Action<[FormData], string>;

export function Trigger() {
  const run = useAction(save);
  return <button onClick={() => void run(new FormData())}>Save</button>;
}
