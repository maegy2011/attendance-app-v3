package com.overtime.clock;

import android.content.Intent;
import android.net.Uri;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// v12.5.5: إلغاء تثبيت ذاتي عبر نافذة النظام — رفض الإخلاء = إلغاء التثبيت
@CapacitorPlugin(name = "Uninstall")
public class UninstallPlugin extends Plugin {
    @PluginMethod
    public void requestUninstall(PluginCall call) {
        try {
            String pkg = getActivity().getPackageName();
            Intent intent = new Intent(Intent.ACTION_DELETE, Uri.parse("package:" + pkg));
            getActivity().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject(e.getMessage() != null ? e.getMessage() : "uninstall failed");
        }
    }
}
