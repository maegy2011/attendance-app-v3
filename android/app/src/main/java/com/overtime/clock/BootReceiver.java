package com.overtime.clock;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import androidx.core.app.NotificationCompat;

// التراك الموحد — بعد كل Restart: تنبيه يطلب فتح البرنامج لتجديد كل الحجوزات من آخر تخطيط محفوظ
// (الجدولة الكاملة تتم في JS scheduleAll مع كل فتحة — الريسيفر يضمن عدم ضياع التنبيه بعد البوت)
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent != null ? intent.getAction() : "";
        if (!Intent.ACTION_BOOT_COMPLETED.equals(action)
                && !"android.intent.action.LOCKED_BOOT_COMPLETED".equals(action)) {
            return;
        }
        try {
            NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            String chId = "general";
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && nm != null) {
                NotificationChannel ch = new NotificationChannel(chId, "تنبيهات عامة", NotificationManager.IMPORTANCE_DEFAULT);
                nm.createNotificationChannel(ch);
            }
            Intent launch = new Intent(context, MainActivity.class);
            launch.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            int flags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
            PendingIntent pi = PendingIntent.getActivity(context, 9811, launch, flags);
            NotificationCompat.Builder b = new NotificationCompat.Builder(context, chId)
                    .setSmallIcon(android.R.drawable.ic_dialog_info)
                    .setContentTitle("HR assist")
                    .setContentText("افتح البرنامج لتحديث الاشعارات")
                    .setContentIntent(pi)
                    .setAutoCancel(true)
                    .setPriority(NotificationCompat.PRIORITY_DEFAULT);
            if (nm != null) nm.notify(9811, b.build());
        } catch (Exception ignored) {}
    }
}
