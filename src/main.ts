import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import './style.css';

// Global Diagnostic & Crash Guard for Desktop / WebView2 Runtime
window.addEventListener('error', (event) => {
  console.error('[Global Error Guard]', event.error || event.message);
  try {
    const errorEntry = `[${new Date().toISOString()}] Global Error: ${event.message} at ${event.filename}:${event.lineno}:${event.colno}\nStack: ${event.error?.stack || 'no stack'}\n`;
    const prev = localStorage.getItem('xiangqi_startup_error_log') || '';
    localStorage.setItem('xiangqi_startup_error_log', (prev + errorEntry).slice(-10000));
  } catch {}
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('[Unhandled Rejection Guard]', event.reason);
  try {
    const errorEntry = `[${new Date().toISOString()}] Unhandled Rejection: ${String(event.reason?.message || event.reason)}\nStack: ${event.reason?.stack || 'no stack'}\n`;
    const prev = localStorage.getItem('xiangqi_startup_error_log') || '';
    localStorage.setItem('xiangqi_startup_error_log', (prev + errorEntry).slice(-10000));
  } catch {}
});

const app = createApp(App);

app.config.errorHandler = (err, _instance, info) => {
  console.error('[Vue App Error Handler]', err, info);
  try {
    const log = `[${new Date().toISOString()}] Vue Error: ${String(err)} (info: ${info})\n`;
    const prev = localStorage.getItem('xiangqi_startup_error_log') || '';
    localStorage.setItem('xiangqi_startup_error_log', (prev + log).slice(-10000));
  } catch {}
};

app.use(createPinia());
app.mount('#app');
