package com.graysonledger;

import android.annotation.SuppressLint;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.TextView;

import androidx.appcompat.app.AppCompatActivity;

import com.chaquo.python.PyObject;
import com.chaquo.python.Python;
import com.chaquo.python.android.AndroidPlatform;

public class MainActivity extends AppCompatActivity {

    private static final String SERVER_URL = "http://127.0.0.1:5000";
    private static final int    START_DELAY_MS = 2500; // give Flask time to bind

    private WebView  webView;
    private TextView statusText;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        webView    = findViewById(R.id.webview);
        statusText = findViewById(R.id.status_text);

        // Configure WebView
        webView.getSettings().setJavaScriptEnabled(true);
        webView.getSettings().setDomStorageEnabled(true);
        webView.getSettings().setAllowFileAccess(false);
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                // Keep all navigation inside the WebView
                return false;
            }
        });

        // Start Python / Flask on a background thread
        startFlaskServer();
    }

    private void startFlaskServer() {
        statusText.setVisibility(View.VISIBLE);
        statusText.setText("Starting server…");

        new Thread(() -> {
            // Init Chaquopy on first run
            if (!Python.isStarted()) {
                Python.start(new AndroidPlatform(this));
            }
            Python py = Python.getInstance();

            // Copy .env from assets to internal storage (first launch only)
            copyEnvFromAssets();

            // Run the Flask server — this call blocks indefinitely
            PyObject server = py.getModule("server");
            server.callAttr("start");
        }, "flask-server").start();

        // Load the UI after a short delay
        new Handler(Looper.getMainLooper()).postDelayed(() -> {
            statusText.setVisibility(View.GONE);
            webView.setVisibility(View.VISIBLE);
            webView.loadUrl(SERVER_URL);
        }, START_DELAY_MS);
    }

    /**
     * On first launch, copy the bundled .env.example from assets to internal storage
     * as ".env" so the app can read credentials.  The user edits this file via the
     * Settings screen inside the app (or by connecting via ADB).
     */
    private void copyEnvFromAssets() {
        java.io.File envFile = new java.io.File(getFilesDir(), ".env");
        if (envFile.exists()) return; // already copied on a prior launch

        try (
            java.io.InputStream in = getAssets().open(".env.example");
            java.io.OutputStream out = new java.io.FileOutputStream(envFile)
        ) {
            byte[] buf = new byte[4096];
            int len;
            while ((len = in.read(buf)) > 0) out.write(buf, 0, len);
        } catch (java.io.IOException e) {
            android.util.Log.e("MainActivity", "Could not copy .env.example", e);
        }
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }
}
