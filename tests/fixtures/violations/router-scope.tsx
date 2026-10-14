// A TanStack import exempts only the names it binds: Router 1.x <Navigate>,
// an aliased-away useRouter, and an unimported notFound are still reported.
import { Link, useRouter as useTanstackRouter } from '@tanstack/solid-router';
import { createRouter, Navigate } from '@solidjs/router';

// The pre-next.38 boolean switch: preloads nothing now.
export const Router = createRouter({ routes: [], preloadLinks: true });

export function Legacy() {
  useTanstackRouter();
  useRouter();
  notFound();
  return (
    <main>
      <Link to="/">Home</Link>
      <Navigate href="/" />
    </main>
  );
}
