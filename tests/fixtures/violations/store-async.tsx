import { createOptimisticStore, createStore } from 'solid-js';

// A store setter callback that awaits — the draft closes when the callback
// returns, so writes after the await are lost (dev: ASYNC_STORE_SETTER).
export function Profile(props: { load: () => Promise<string> }) {
  const [profile, setProfile] = createStore({ name: '' });
  const [drafts, setDrafts] = createOptimisticStore<string[]>([]);

  const reload = () => {
    setProfile(async (draft) => {
      draft.name = await props.load();
    });
    setDrafts(async (draft) => {
      draft.push(await props.load());
    });
  };

  return <button onClick={reload}>{profile.name} ({drafts.length})</button>;
}
