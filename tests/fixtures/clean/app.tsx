import {
  children,
  createUniqueId,
  lazy,
  Loading,
  onSettled,
  type ParentProps,
} from 'solid-js';
import { clientOnly, dynamic, httpStatus, isServer } from '@solidjs/web';
import { createRouter } from '@solidjs/router';
import { Title } from '@solidjs/meta';

const Home = lazy(() => import('./Home'));
const Chart = clientOnly(() => import('./Chart'));
const Panel = dynamic(() => (isServer ? Home : Chart));

export const Router = createRouter({
  routes: [{ path: '/', component: Home }],
});

function listen(type: string, handler: EventListener) {
  let element: HTMLElement | undefined;
  onSettled(() => {
    const target = element;
    if (!target) return;
    target.addEventListener(type, handler);
    return () => target.removeEventListener(type, handler);
  });
  return (next: HTMLElement) => {
    element = next;
  };
}

function Stack(props: ParentProps) {
  const resolved = children(() => props.children);
  const id = createUniqueId();
  return (
    <section id={id} class={['stack', { ready: true }]}>
      <Title>Home</Title>
      {resolved.toArray()}
    </section>
  );
}

export default function App() {
  if (isServer) httpStatus(200);
  let input!: HTMLInputElement;
  return (
    <Router>
      {(props) => (
        <Stack>
          <a href={Router.paths()}>Home</a>
          <Loading fallback={<p>Loading…</p>}>
            <Panel />
          </Loading>
          <input ref={[listen('focus', () => input.select()), (el) => (input = el)]} />
          {props.children}
        </Stack>
      )}
    </Router>
  );
}
