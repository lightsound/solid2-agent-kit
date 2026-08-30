import { hydrate, render, renderToStream } from '@solidjs/web';
import App from './app';

const root = document.getElementById('app')!;
render(() => <App />, root);
hydrate(() => <App />, root);
void renderToStream(() => <App />);
