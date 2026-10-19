// Installation never changes authentication, entitlement or offline business data.
export function createWholesaleInstallController(environment) {
  const media = environment?.matchMedia?.('(display-mode: standalone)');
  let promptEvent = null;
  let disposed = false;
  let installed = false;
  let generation = 0;
  const listeners = new Set();
  const standalone = () => Boolean(environment?.navigator?.standalone || media?.matches);
  let state = Object.freeze({status: standalone() ? 'installed' : 'unsupported'});
  function publish(status) {
    if (disposed) return;
    state = Object.freeze({status});
    for (const listener of listeners) listener(state);
  }
  function beforePrompt(event) {
    event.preventDefault();
    if (disposed || installed || standalone() || state.status === 'prompting') return;
    if (typeof event.prompt !== 'function') return;
    promptEvent = event;
    publish('ready');
  }
  function appInstalled() {
    installed = true;
    generation++;
    promptEvent = null;
    publish('installed');
  }
  function displayChanged() {
    generation++;
    promptEvent = null;
    publish(installed || standalone() ? 'installed' : 'unsupported');
  }
  environment?.addEventListener?.('beforeinstallprompt', beforePrompt);
  environment?.addEventListener?.('appinstalled', appInstalled);
  if (media?.addEventListener) media.addEventListener('change', displayChanged);
  else media?.addListener?.(displayChanged);
  return {
    getState: () => state,
    subscribe(listener) {
      if (disposed) return () => {};
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async install() {
      if (disposed || !promptEvent || state.status !== 'ready') return false;
      const event = promptEvent;
      promptEvent = null; // Browser install events are single-use, including failures.
      const ownGeneration = ++generation;
      publish('prompting');
      try {
        await event.prompt();
        const choice = await event.userChoice;
        if (!disposed && generation === ownGeneration) {
          publish(installed || standalone() ? 'installed' : choice?.outcome === 'accepted' ? 'accepted' : 'cancelled');
        }
      } catch {
        if (!disposed && generation === ownGeneration) publish('error');
      }
      return true;
    },
    dispose() {
      disposed = true;
      generation++;
      promptEvent = null;
      listeners.clear();
      environment?.removeEventListener?.('beforeinstallprompt', beforePrompt);
      environment?.removeEventListener?.('appinstalled', appInstalled);
      if (media?.removeEventListener) media.removeEventListener('change', displayChanged);
      else media?.removeListener?.(displayChanged);
    }
  };
}
