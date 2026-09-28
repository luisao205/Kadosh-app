package com.kadosh.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "KadoshUpdate")
public class KadoshUpdatePlugin extends Plugin {
    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    @PluginMethod
    public void downloadAndInstall(PluginCall call) {
        String url = call.getString("url", "").trim();
        String version = call.getString("version", "update").trim();

        if (!url.startsWith("https://")) {
            call.reject("La actualización debe usar una URL HTTPS válida.");
            return;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                && !getContext().getPackageManager().canRequestPackageInstalls()) {
            Intent settingsIntent = new Intent(
                    Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:" + getContext().getPackageName())
            );
            if (getActivity() != null) {
                getActivity().startActivity(settingsIntent);
            } else {
                settingsIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(settingsIntent);
            }

            JSObject result = new JSObject();
            result.put("permissionRequired", true);
            call.resolve(result);
            return;
        }

        executor.execute(() -> {
            HttpURLConnection connection = null;
            try {
                URL downloadUrl = new URL(url);
                connection = (HttpURLConnection) downloadUrl.openConnection();
                connection.setInstanceFollowRedirects(true);
                connection.setConnectTimeout(20_000);
                connection.setReadTimeout(120_000);
                connection.setRequestProperty("User-Agent", "Kadosh-App-Android-Updater");
                connection.connect();

                int responseCode = connection.getResponseCode();
                if (responseCode < 200 || responseCode >= 300) {
                    throw new IllegalStateException("No se pudo descargar el APK. HTTP " + responseCode);
                }

                String safeVersion = version.replaceAll("[^0-9A-Za-z._-]", "_");
                File apkFile = new File(getContext().getCacheDir(), "kadosh-update-" + safeVersion + ".apk");

                try (InputStream input = connection.getInputStream();
                     FileOutputStream output = new FileOutputStream(apkFile, false)) {
                    byte[] buffer = new byte[64 * 1024];
                    int read;
                    while ((read = input.read(buffer)) != -1) {
                        output.write(buffer, 0, read);
                    }
                    output.flush();
                }

                Uri apkUri = FileProvider.getUriForFile(
                        getContext(),
                        getContext().getPackageName() + ".fileprovider",
                        apkFile
                );

                Intent installIntent = new Intent(Intent.ACTION_VIEW);
                installIntent.setDataAndType(apkUri, "application/vnd.android.package-archive");
                installIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                installIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

                if (getActivity() != null) {
                    getActivity().runOnUiThread(() -> {
                        try {
                            getContext().startActivity(installIntent);
                            JSObject result = new JSObject();
                            result.put("installerOpened", true);
                            call.resolve(result);
                        } catch (Exception error) {
                            call.reject("No se pudo abrir el instalador de Android.", error);
                        }
                    });
                } else {
                    getContext().startActivity(installIntent);
                    JSObject result = new JSObject();
                    result.put("installerOpened", true);
                    call.resolve(result);
                }
            } catch (Exception error) {
                call.reject("No se pudo descargar o preparar la actualización.", error);
            } finally {
                if (connection != null) connection.disconnect();
            }
        });
    }

    @Override
    protected void handleOnDestroy() {
        executor.shutdownNow();
        super.handleOnDestroy();
    }
}
