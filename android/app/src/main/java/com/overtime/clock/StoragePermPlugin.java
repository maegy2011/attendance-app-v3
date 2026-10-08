package com.overtime.clock;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.Settings;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// v12.9.63: صلاحية "إدارة كل الملفات" — بدونها الكتابة في Documents ممنوعة على أندرويد 11+
@CapacitorPlugin(name = "StoragePerm")
public class StoragePermPlugin extends Plugin {

    // هل التطبيق عنده صلاحية الكتابة في المستندات؟
    @PluginMethod
    public void isGranted(PluginCall call) {
        boolean ok = true;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            ok = Environment.isExternalStorageManager();
        }
        call.resolve(new com.getcapacitor.JSObject().put("granted", ok));
    }

    // طلب الصلاحية: أندرويد بيوديك لصفحة الإعدادات (أنت اللي بتتحكم) — راجع ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION
    @PluginMethod
    public void request(PluginCall call) {
        try {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) { call.resolve(); return; }
            if (Environment.isExternalStorageManager()) { call.resolve(); return; }
            Intent intent = new Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION);
            intent.setData(Uri.parse("package:" + getActivity().getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getActivity().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            try {
                Intent fallback = new Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION);
                fallback.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getActivity().startActivity(fallback);
                call.resolve();
            } catch (Exception e2) {
                call.reject(e2.getMessage() != null ? e2.getMessage() : "تعذر فتح إعدادات الصلاحية");
            }
        }
    }
}
