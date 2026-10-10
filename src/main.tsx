import { render } from 'preact';
import { registerSW } from 'virtual:pwa-register';
import { App } from './app';
import { updateReady } from './state';
import './styles.css';

// A new version never reloads the page mid-session: it waits for a tap or the next launch.
const updateSW = registerSW({
  onNeedRefresh() {
    updateReady.value = () => { void updateSW(true); };
  },
});

document.addEventListener('contextmenu', (e) => e.preventDefault());
render(<App />, document.getElementById('app')!);
