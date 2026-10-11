import { capturePublicPageview } from './lib/posthog';
import './styles/main.css';
import 'maplibre-gl/dist/maplibre-gl.css';
import { inject } from '@vercel/analytics';
import { App } from './App';
import { debugInjectTestEvents, debugGetCells, getCellCount } from '@/services/geo-convergence';
import { initMetaTags } from '@/services/meta-tags';
import { installRuntimeFetchPatch } from '@/services/runtime';
import { loadDesktopSecrets } from '@/services/runtime-config';

// Initialize Vercel Analytics
inject();

// Initialize dynamic meta tags for sharing
initMetaTags();

// In desktop mode, route /api/* calls to the local Tauri sidecar backend.
installRuntimeFetchPatch();
void loadDesktopSecrets();

const app = new App('app');
app.init().catch(console.error);

// Debug helpers for geo-convergence testing (remove in production)
(window as unknown as Record<string, unknown>).geoDebug = {
  inject: debugInjectTestEvents,
  cells: debugGetCells,
  count: getCellCount,
};

if (!('__TAURI_INTERNALS__' in window) && !('__TAURI__' in window)) {
  import('virtual:pwa-register').then(({ registerSW }) => {
    registerSW({
      onRegisteredSW(_swUrl, registration) {
        if (registration) {
          setInterval(async () => {
            if (!navigator.onLine) return;
            try { await registration.update(); } catch {}
          }, 60 * 60 * 1000);
        }
      },
      onOfflineReady() {
        console.log('[PWA] App ready for offline use');
      },
    });
  });
}

// Cookieless public-root pageview; desktop, preview, DNT and GPC never capture.
void capturePublicPageview(import.meta.env.VITE_POSTHOG_KEY, {
 hostname: location.hostname, pathname: location.pathname, referrer: document.referrer,
 doNotTrack: navigator.doNotTrack,
 globalPrivacyControl: (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl,
 automation: navigator.webdriver || new URLSearchParams(location.search).get('telemetry') === 'smoke',
 distinctId: crypto.randomUUID(),
}).then(result => { if (result === 'failed') console.warn('EnergyMonitor analytics delivery failed'); });
