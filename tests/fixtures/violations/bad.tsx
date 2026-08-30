import { lazy } from 'react';
import { onError, catchError, createDynamic, renderToStringAsync, clearDelegatedEvents } from 'solid-js';
import { Route, HashRouter, Navigate } from '@solidjs/router';
import { GET } from '@solidjs/start';
import { createAsync } from '@solidjs/router';
import { defineEventHandler } from 'h3';
import Link from 'next/link';
import { render } from '@solidjs/web';

'use client';

const Page = React.lazy(() => import('./Page'));
const About = lazy(() => import('./pages').then((m) => ({ default: m.About })));

export default function Broken() {
  onError(() => {});
  catchError(() => {});
  useId();
  useOptimistic();
  useSubmission(save);
  createAsync(() => GET());
  defineEventHandler(() => {});
  useRouter();
  usePathname();
  notFound();
  hydrateRoot();
  typeof window;
  isPending(user());
  latest(data());
  history.pushState({}, '', '/');
  window.location.href = '/';
  const [count, setCount] = [0, (n: unknown) => n];
  createDynamic(() => Page);
  renderToStringAsync(() => Page);
  clearDelegatedEvents();
  render(<Page />, document.body);

  return (
    <HashRouter>
      <MetaProvider>
        <Route path="/" component={Page} />
        <Navigate href="/" />
        <FileRoutes />
        <A href="/" />
        <div className="box" use:model={1} on:click={noop} attr:title="x" onDoubleClick={noop} onKeyPress={noop} suppressHydrationWarning={true} />
        <button type="button" onClick={setCount}>n</button>
        <Dynamic component={Page} />
        <Link href="/" />
      </MetaProvider>
    </HashRouter>
  );
}

function noop() {}

function Mapped(props: { label: string }) {
  const rest = { ...props };
  const items = () => ['a', 'b'];
  return (
    <ul>
      {items().map((x) => (
        <li>{x}</li>
      ))}
      <For each={items().map((x) => x)}>{(x) => <li>{x}</li>}</For>
      <input {...rest} />
      <div dangerouslySetInnerHTML={{ __html: '<p>x</p>' }} />
    </ul>
  );
}
