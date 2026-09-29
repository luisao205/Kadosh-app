package com.kadosh.app;

import android.os.Bundle;
import android.util.Log;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final String PWA_CLEANUP_TAG = "KadoshPwaCleanup";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(KadoshUpdatePlugin.class);
        super.onCreate(savedInstanceState);

        WebView webView = getBridge().getWebView();

        // Algunas instalaciones antiguas de Android registraron el PWA dentro
        // del WebView. Limpiamos únicamente Service Workers + Cache Storage,
        // sin borrar cookies, localStorage, IndexedDB ni datos de la aplicación.
        webView.postDelayed(() -> cleanupLegacyPwa(webView), 750);
        webView.postDelayed(() -> cleanupLegacyPwa(webView), 2500);
    }

    private void cleanupLegacyPwa(WebView webView) {
        String script =
            "(() => {" +
            "  const controlled = !!(navigator.serviceWorker && navigator.serviceWorker.controller);" +
            "  Promise.resolve().then(async () => {" +
            "    let changed = false;" +
            "    if ('serviceWorker' in navigator) {" +
            "      const registrations = await navigator.serviceWorker.getRegistrations();" +
            "      if (registrations.length) changed = true;" +
            "      await Promise.all(registrations.map(registration => registration.unregister()));" +
            "    }" +
            "    if ('caches' in window) {" +
            "      const keys = await caches.keys();" +
            "      if (keys.length) changed = true;" +
            "      await Promise.all(keys.map(key => caches.delete(key)));" +
            "    }" +
            "    if (changed || controlled) location.reload();" +
            "  }).catch(error => console.warn('legacy-pwa-cleanup', error));" +
            "  return controlled ? 'controlled' : 'scheduled';" +
            "})()";

        webView.evaluateJavascript(
            script,
            result -> Log.i(PWA_CLEANUP_TAG, "cleanup result=" + result)
        );
    }
}
