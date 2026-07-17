package com.syntraiq.com;

import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.MimeTypeMap;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

/**
 * Save / share generated media on Android (Downloads + system share sheet).
 */
@CapacitorPlugin(name = "MediaFiles")
public class MediaFilesPlugin extends Plugin {

    @PluginMethod
    public void save(PluginCall call) {
        String data = call.getString("data");
        String filename = call.getString("filename", "download.bin");
        String mimeType = call.getString("mimeType", "application/octet-stream");

        if (data == null || data.isEmpty()) {
            call.reject("Missing file data");
            return;
        }

        try {
            byte[] bytes = Base64.decode(stripDataUrl(data), Base64.DEFAULT);
            Uri uri = writeToDownloads(bytes, filename, mimeType);
            if (uri == null) {
                call.reject("Unable to save file");
                return;
            }
            JSObject result = new JSObject();
            result.put("uri", uri.toString());
            result.put("filename", filename);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Save failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void share(PluginCall call) {
        String data = call.getString("data");
        String filename = call.getString("filename", "share.bin");
        String mimeType = call.getString("mimeType", "application/octet-stream");

        if (data == null || data.isEmpty()) {
            call.reject("Missing file data");
            return;
        }

        try {
            byte[] bytes = Base64.decode(stripDataUrl(data), Base64.DEFAULT);
            File cacheFile = new File(getContext().getCacheDir(), filename);
            try (FileOutputStream fos = new FileOutputStream(cacheFile)) {
                fos.write(bytes);
            }

            Uri contentUri = FileProvider.getUriForFile(
                getContext(),
                getContext().getPackageName() + ".fileprovider",
                cacheFile
            );

            Intent shareIntent = new Intent(Intent.ACTION_SEND);
            shareIntent.setType(mimeType);
            shareIntent.putExtra(Intent.EXTRA_STREAM, contentUri);
            shareIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

            Intent chooser = Intent.createChooser(shareIntent, "Share");
            chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(chooser);

            JSObject result = new JSObject();
            result.put("shared", true);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Share failed: " + e.getMessage());
        }
    }

    private Uri writeToDownloads(byte[] bytes, String filename, String mimeType) throws Exception {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ContentValues values = new ContentValues();
            values.put(MediaStore.Downloads.DISPLAY_NAME, filename);
            values.put(MediaStore.Downloads.MIME_TYPE, mimeType);
            values.put(MediaStore.Downloads.IS_PENDING, 1);

            Uri collection = MediaStore.Downloads.EXTERNAL_CONTENT_URI;
            Uri item = getContext().getContentResolver().insert(collection, values);
            if (item == null) return null;

            try (OutputStream out = getContext().getContentResolver().openOutputStream(item)) {
                if (out == null) return null;
                out.write(bytes);
            }

            values.clear();
            values.put(MediaStore.Downloads.IS_PENDING, 0);
            getContext().getContentResolver().update(item, values, null, null);
            return item;
        }

        File downloads = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
        if (!downloads.exists() && !downloads.mkdirs()) {
            return null;
        }
        File outFile = new File(downloads, filename);
        try (FileOutputStream fos = new FileOutputStream(outFile)) {
            fos.write(bytes);
        }
        Intent scan = new Intent(Intent.ACTION_MEDIA_SCANNER_SCAN_FILE);
        scan.setData(Uri.fromFile(outFile));
        getContext().sendBroadcast(scan);
        return Uri.fromFile(outFile);
    }

    private static String stripDataUrl(String data) {
        int comma = data.indexOf(',');
        if (data.startsWith("data:") && comma > 0) {
            return data.substring(comma + 1);
        }
        return data;
    }
}
