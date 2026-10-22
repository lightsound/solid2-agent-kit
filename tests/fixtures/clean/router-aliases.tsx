// The deprecated-name gates read the imported name, not the local one: binding
// the live `formAction` / `FormAction` exports under the old names is clean.
import { formAction as action, type FormAction as Action } from '@solidjs/router';
export { formAction as save, type FormAction as Save } from '@solidjs/router/data';

export const save = action(async (form: FormData) => String(form.get('note') ?? ''), 'save');
export type Save = Action<[FormData], string>;
