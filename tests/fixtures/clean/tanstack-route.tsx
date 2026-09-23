// src/routes/users.$id.tsx in the fullstack-tanstack shape: TanStack Router's
// own useRouter(), notFound(), and <Navigate> are not Next.js / Router 1.x.
import { useQuery } from '@tanstack/solid-query';
import {
  createFileRoute,
  Link,
  Navigate,
  notFound,
  useRouter,
} from '@tanstack/solid-router';
import { isNotFound } from '@tanstack/router-core';
import { isPending, Show } from 'solid-js';
import { prefetch, userQuery } from '../lib/queries';
import { findUser } from '../lib/users';

export const Route = createFileRoute('/users/$id')({
  loader: async ({ context, params }) => {
    if (!(await findUser(params.id))) throw notFound();
    prefetch(context.queryClient, userQuery(params.id));
  },
  component: UserPage,
});

function UserPage() {
  const params = Route.useParams();
  const router = useRouter();
  const user = useQuery(() => userQuery(params().id));

  return (
    <section style={{ opacity: isPending(() => user.data) ? 0.5 : 1 }}>
      <h2>{user.data.name}</h2>
      <button type="button" onClick={() => router.invalidate()}>
        Refresh
      </button>
      <Link to="/users">All users</Link>
      <Show when={user.data.archived}>
        <Navigate to="/users" />
      </Show>
    </section>
  );
}

export { isNotFound };
