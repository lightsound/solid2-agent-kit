import { lazy } from 'react';
import { onError, catchError, createDynamic, renderToStringAsync, clearDelegatedEvents } from 'solid-js';
import { Route, HashRouter, Navigate } from '@solidjs/router';

const Page = React.lazy(() => import('./Page'));

export default function Broken() {
  onError(() => {});
  catchError(() => {});
  createDynamic(() => Page);
  renderToStringAsync(() => Page);
  clearDelegatedEvents();

  return (
    <HashRouter>
      <MetaProvider>
        <Route path="/" component={Page} />
        <Navigate href="/" />
        <div className="box" use:model={1} on:click={noop} attr:title="x" />
      </MetaProvider>
    </HashRouter>
  );
}

function noop() {}
