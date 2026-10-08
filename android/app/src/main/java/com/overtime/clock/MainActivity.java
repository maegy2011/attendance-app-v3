package com.overtime.clock;

import android.content.res.Configuration;
import android.content.res.Resources;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.WindowManager;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(UninstallPlugin.class); // v12.5.5: إلغاء التثبيت الذاتي
        registerPlugin(StoragePermPlugin.class); // v12.9.63: صلاحية إدارة كل الملفات
        super.onCreate(savedInstanceState);
        // إصلاح التعديل ١ (v12.9.8): يدوي (مكتبة androidx أقدم من enableEdgeToEdge) + إصلاح سطر النوتش
        // + الشفافية أيضاً على مستوى الثيم (styles.xml من v12.9.7)
        try {
            WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
            getWindow().setStatusBarColor(Color.TRANSPARENT);
            getWindow().setNavigationBarColor(Color.TRANSPARENT);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                WindowManager.LayoutParams lp = getWindow().getAttributes();
                lp.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
                getWindow().setAttributes(lp);
            }
            WindowInsetsControllerCompat ctl = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
            ctl.setAppearanceLightStatusBars(false); // v12.11.14: أيقونات فاتحة فوق التدرج الغامق
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                ctl.setAppearanceLightNavigationBars(true);
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                getWindow().setNavigationBarContrastEnforced(false);
            }
        } catch (Exception ignored) {}
        // v12.11.45: تثبيت خط البرنامج — قفل تكبير نص السيستم عن الويب فيو
        try { getBridge().getWebView().getSettings().setTextZoom(100); } catch (Exception ignored) {}
    }

    // v12.11.45: إجبار fontScale = 1 — خط الأندرويد ميأثرش على البرنامج
    @Override
    public Resources getResources() {
        try {
            Resources res = super.getResources();
            Configuration c = res.getConfiguration();
            if (c.fontScale != 1.0f) {
                Configuration n = new Configuration(c);
                n.fontScale = 1.0f;
                res.updateConfiguration(n, res.getDisplayMetrics());
            }
            return res;
        } catch (Exception e) { return super.getResources(); }
    }
}
