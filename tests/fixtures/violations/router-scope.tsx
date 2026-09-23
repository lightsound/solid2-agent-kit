// A TanStack import exempts only the names it binds: Router 1.x <Navigate>,
// an aliased-away useRouter, and an unimported notFound are still reported.
import { Link, useRouter as useTanstackRouter } from '@tanstack/solid-router';
import { Navigate } from '@solidjs/router';

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
