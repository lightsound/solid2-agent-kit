export const claim =
  'The official Solid Router navigation page (routing/solid-router/navigation) still describes `data-pending` as set automatically on every handled anchor and `aria-current` as an exact path match; since @solidjs/router 2.0.0-next.37 `data-pending` needs `createRouter({ links: pendingLinks })` and `aria-current` also compares the query.';
export const packages = ['@solidjs/router'];

const PAGE = 'https://v2-rebuild--solid-docs-v2.netlify.app/routing/solid-router/navigation.md';

export async function probe() {
  const response = await fetch(PAGE);
  if (!response.ok) throw new Error(`GET ${PAGE}: ${response.status}`);
  const page = await response.text();
  const automatic =
    page.includes('The router sets three attributes on the anchors it handles') &&
    page.includes('`data-pending` on the target of an in-flight navigation.');
  const optInMentioned = page.includes('pendingLinks');
  return {
    reproduces: automatic && !optInMentioned,
    observed: `navigation page lists data-pending among the automatic attributes: ${automatic}; mentions pendingLinks: ${optInMentioned}`,
  };
}
