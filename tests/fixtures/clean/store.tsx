import { createSignal, createStore } from 'solid-js';

// Synchronous draft setters, an async signal setter (a signal may hold a
// promise), and an external set*-named function taking an async callback —
// none of these may trip `store-setter-async`.
function setDefaultOptions(load: () => Promise<void>) {
  void load;
}

export function Profile(props: { load: () => Promise<string> }) {
  const [profile, setProfile] = createStore({ name: '' });
  const [pendingName, setPendingName] = createSignal<Promise<string> | null>(null);

  const reload = async () => {
    const name = await props.load();
    setProfile((draft) => {
      draft.name = name;
    });
    setPendingName(async () => props.load());
    setDefaultOptions(async () => {});
  };

  return <button onClick={reload}>{profile.name} {String(pendingName())}</button>;
}
