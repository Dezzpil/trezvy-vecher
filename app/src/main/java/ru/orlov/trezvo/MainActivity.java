package ru.orlov.trezvo;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.media.MediaPlayer;
import android.media.MediaRecorder;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

public class MainActivity extends Activity {
    private WebView web;
    private MediaRecorder recorder;
    private MediaPlayer player;
    private String currentRec;

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        web.setWebChromeClient(new WebChromeClient());
        web.addJavascriptInterface(new Bridge(), "Android");
        setContentView(web);
        web.loadUrl("file:///android_asset/index.html");
        java.util.ArrayList<String> p = new java.util.ArrayList<>();
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) p.add(Manifest.permission.RECORD_AUDIO);
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) p.add(Manifest.permission.POST_NOTIFICATIONS);
        if (!p.isEmpty()) requestPermissions(p.toArray(new String[0]), 1);
        Reminders.schedule(this);
        handleIntent(getIntent());
    }

    @Override protected void onNewIntent(Intent i) { super.onNewIntent(i); handleIntent(i); }

    private void handleIntent(Intent i) {
        if (i == null) return;
        final String screen = i.getStringExtra("screen");
        if (screen != null) web.postDelayed(() -> web.evaluateJavascript("window.openFromNotification && openFromNotification('" + screen + "')", null), 600);
    }

    @Override public void onBackPressed() {
        web.evaluateJavascript("window.goBack ? goBack() : 'exit'", v -> { if (v != null && v.contains("exit")) MainActivity.super.onBackPressed(); });
    }

    File dataFile() { return new File(getFilesDir(), "data.json"); }
    File audioDir() { File d = new File(getFilesDir(), "audio"); d.mkdirs(); return d; }

    static String read(File f) throws IOException {
        try (InputStream in = new FileInputStream(f)) {
            ByteArrayOutputStream o = new ByteArrayOutputStream(); byte[] buf = new byte[8192]; int n;
            while ((n = in.read(buf)) > 0) o.write(buf, 0, n);
            return o.toString("UTF-8");
        }
    }

    class Bridge {
        @JavascriptInterface public String load() {
            try { return dataFile().exists() ? read(dataFile()) : ""; } catch (Exception e) { return ""; }
        }
        @JavascriptInterface public boolean save(String json) {
            try {
                File tmp = new File(getFilesDir(), "data.json.tmp");
                try (OutputStream o = new FileOutputStream(tmp)) { o.write(json.getBytes(StandardCharsets.UTF_8)); }
                return tmp.renameTo(dataFile());
            } catch (Exception e) { return false; }
        }
        @JavascriptInterface public String startRecording(String id) {
            if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
                runOnUiThread(() -> requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, 2));
                return "no_permission";
            }
            try {
                stopPlayback();
                String name = id + ".m4a";
                recorder = new MediaRecorder();
                recorder.setAudioSource(MediaRecorder.AudioSource.MIC);
                recorder.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4);
                recorder.setAudioEncoder(MediaRecorder.AudioEncoder.AAC);
                recorder.setAudioEncodingBitRate(64000);
                recorder.setAudioSamplingRate(44100);
                recorder.setOutputFile(new File(audioDir(), name).getAbsolutePath());
                recorder.prepare(); recorder.start();
                currentRec = name;
                return name;
            } catch (Exception e) { recorder = null; return "error:" + e.getMessage(); }
        }
        @JavascriptInterface public String stopRecording() {
            try { if (recorder != null) { recorder.stop(); recorder.release(); } } catch (Exception ignored) {}
            recorder = null; String r = currentRec; currentRec = null; return r == null ? "" : r;
        }
        @JavascriptInterface public boolean play(String name) {
            try {
                stopPlayback();
                player = new MediaPlayer();
                player.setDataSource(new File(audioDir(), name).getAbsolutePath());
                player.setOnCompletionListener(mp -> web.post(() -> web.evaluateJavascript("window.onPlayEnd && onPlayEnd()", null)));
                player.prepare(); player.start(); return true;
            } catch (Exception e) { return false; }
        }
        @JavascriptInterface public void stop() { stopPlayback(); }
        @JavascriptInterface public void deleteAudio(String name) { new File(audioDir(), name).delete(); }
        @JavascriptInterface public void setReminders(String json) {
            getSharedPreferences("r", MODE_PRIVATE).edit().putString("times", json).apply();
            Reminders.schedule(MainActivity.this);
        }
        @JavascriptInterface public String export(String markdown, String fileName) {
            try {
                File dir = new File(getCacheDir(), "exports"); dir.mkdirs();
                for (File old : dir.listFiles()) old.delete();
                File zip = new File(dir, fileName);
                try (ZipOutputStream z = new ZipOutputStream(new FileOutputStream(zip))) {
                    z.putNextEntry(new ZipEntry("journal.md")); z.write(markdown.getBytes(StandardCharsets.UTF_8)); z.closeEntry();
                    if (dataFile().exists()) { z.putNextEntry(new ZipEntry("data.json")); z.write(read(dataFile()).getBytes(StandardCharsets.UTF_8)); z.closeEntry(); }
                    File[] a = audioDir().listFiles();
                    if (a != null) for (File f : a) {
                        z.putNextEntry(new ZipEntry("audio/" + f.getName()));
                        try (InputStream in = new FileInputStream(f)) { byte[] buf = new byte[8192]; int n; while ((n = in.read(buf)) > 0) z.write(buf, 0, n); }
                        z.closeEntry();
                    }
                }
                Uri uri = Uri.parse("content://ru.orlov.trezvo.export/" + fileName);
                Intent share = new Intent(Intent.ACTION_SEND);
                share.setType("application/zip");
                share.putExtra(Intent.EXTRA_STREAM, uri);
                share.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                startActivity(Intent.createChooser(share, "Выгрузить дневник"));
                return "ok";
            } catch (Exception e) { return "error:" + e.getMessage(); }
        }
        @JavascriptInterface public void shareText(String text) {
            Intent share = new Intent(Intent.ACTION_SEND); share.setType("text/plain"); share.putExtra(Intent.EXTRA_TEXT, text);
            startActivity(Intent.createChooser(share, "Отправить"));
        }
        @JavascriptInterface public void vibrate() {
            try { ((android.os.Vibrator) getSystemService(VIBRATOR_SERVICE)).vibrate(android.os.VibrationEffect.createOneShot(300, 180)); } catch (Exception ignored) {}
        }
        @JavascriptInterface public void call(String number) {
            startActivity(new Intent(Intent.ACTION_DIAL, Uri.parse("tel:" + number)));
        }
    }

    void stopPlayback() { try { if (player != null) { player.stop(); player.release(); } } catch (Exception ignored) {} player = null; }
}
