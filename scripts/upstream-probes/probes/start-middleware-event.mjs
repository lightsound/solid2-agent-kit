export const claim =
  '`start: { middleware }` default-exports `(event, next) => Response` (`StartMiddleware`, exported from `@solidjs/vite-plugin`): the request is `event.request`, `next()` takes no arguments (assign `event.request` to substitute it), and per-request `event.nonce` / `event.renderMode` are set before `next()`. Before 3.0.0-next.48 it was a fetch-style `(request, next)`.';
export const packages = ['@solidjs/vite-plugin'];

export async function probe(h) {
  const ssr = h.read('@solidjs/vite-plugin', 'dist/types/src/ssr/index.d.ts');
  const event = h.read('@solidjs/vite-plugin', 'dist/types/src/request-event.d.ts');
  const index = h.read('@solidjs/vite-plugin', 'dist/types/src/index.d.ts');
  const eventForm = /`\(event, next\) => Response\s*\*?\s*\| Promise<Response>`, the request at `event\.request`/.test(ssr);
  const noArgs = /`next\(\)` advances the\s*\*?\s*chain and takes no arguments/.test(ssr);
  const renderInputs = /`event\.nonce`/.test(ssr) && /`event\.renderMode`/.test(ssr);
  const typed = /export type StartMiddleware = \(event: RequestEvent, next: \(\) => Promise<Response>\) =>/.test(event) &&
    /export type \{ StartMiddleware \} from '\.\/request-event\.js'/.test(index);
  const fetchStyleGone = !/fetch-style middleware function — `\(request,/.test(ssr);
  return {
    reproduces: eventForm && noArgs && renderInputs && typed && fetchStyleGone,
    observed: `(event, next) form documented: ${eventForm}; next() takes no arguments: ${noArgs}; event.nonce / event.renderMode documented: ${renderInputs}; StartMiddleware exported: ${typed}; fetch-style (request, next) wording absent: ${fetchStyleGone}`,
  };
}
