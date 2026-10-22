export const claim =
  '`@solidjs/router` renamed its form action to `formAction` / `FormAction`: `action` / `Action` remain as `@deprecated` aliases that warn once in dev on first call, and `useAction` is `@deprecated` with a dev warning telling callers to call the server function or a core `action` directly.';
export const packages = ['@solidjs/router'];

export async function probe(h) {
  const deprecated = h.read('@solidjs/router', 'dist/data/deprecated.js');
  const actionImpl = h.read('@solidjs/router', 'dist/data/action.js');
  const { tags, codes } = h.typecheck(
    `import { action, formAction, useAction, type Action, type FormAction } from "@solidjs/router";
     void action; void formAction; void useAction;
     type A = Action<[FormData], void>; type F = FormAction<[FormData], void>;
     const a: A = null as unknown as F; void a;`,
  );
  const aliasWarns = /`action` is deprecated and will be removed in the next major; use `formAction` instead/.test(deprecated) && /return formAction\.apply\(this, args\)/.test(deprecated);
  const useActionWarns = /`useAction` is deprecated and will be removed in the next major; call the server function or a core `action` directly/.test(actionImpl);
  const deprecatedTags = ['action', 'Action', 'useAction'].every((name) => tags[name]?.includes('deprecated'));
  const formActionLive = tags.formAction && !tags.formAction.includes('deprecated') && tags.FormAction && !tags.FormAction.includes('deprecated');
  return {
    reproduces: aliasWarns && useActionWarns && deprecatedTags && formActionLive && codes.length === 0,
    observed: `action alias forwards to formAction and warns: ${aliasWarns}; useAction warns: ${useActionWarns}; @deprecated tags on action/Action/useAction: ${deprecatedTags}; formAction/FormAction undeprecated: ${formActionLive}; type errors: ${codes.join(',') || 'none'}`,
  };
}
