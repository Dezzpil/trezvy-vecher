package ru.orlov.trezvo;

import android.content.*;
import android.database.*;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;
import java.io.*;

public class ExportProvider extends ContentProvider {
    File file(Uri u) throws FileNotFoundException {
        File f = new File(new File(getContext().getCacheDir(), "exports"), new File(u.getPath()).getName());
        if (!f.exists()) throw new FileNotFoundException(); return f;
    }
    @Override public boolean onCreate() { return true; }
    @Override public ParcelFileDescriptor openFile(Uri u, String mode) throws FileNotFoundException { return ParcelFileDescriptor.open(file(u), ParcelFileDescriptor.MODE_READ_ONLY); }
    @Override public String getType(Uri u) { return "application/zip"; }
    @Override public Cursor query(Uri u, String[] p, String s, String[] a, String o) {
        try { File f = file(u); MatrixCursor c = new MatrixCursor(new String[]{OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE}); c.addRow(new Object[]{f.getName(), f.length()}); return c; }
        catch (Exception e) { return null; }
    }
    @Override public Uri insert(Uri u, ContentValues v) { return null; }
    @Override public int delete(Uri u, String s, String[] a) { return 0; }
    @Override public int update(Uri u, ContentValues v, String s, String[] a) { return 0; }
}
