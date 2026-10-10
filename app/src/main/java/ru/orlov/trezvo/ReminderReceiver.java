package ru.orlov.trezvo;

import android.app.*;
import android.content.*;

public class ReminderReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context c, Intent in) {
        String k = in.getStringExtra("kind"); if (k == null) k = "";
        String title, text;
        switch (k) {
            case "morning": title = "Утренний чекпоинт"; text = "Как ты сегодня? Отметь настроение и план на вечер."; break;
            case "afternoon": title = "Вторая половина дня"; text = "Обычно здесь появляется мысль о вечере. Что ты хочешь с себя снять?"; break;
            case "evening": title = "Время снять плащ"; text = "Твой перерыв без дежурства. Сначала ритуал, потом решения."; break;
            default: title = "Итог дня"; text = "Две минуты: как прошёл вечер? Запись голосом тоже подойдёт."; k = "night";
        }
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        nm.createNotificationChannel(new NotificationChannel("checkpoints", "Чекпоинты", NotificationManager.IMPORTANCE_HIGH));
        Intent open = new Intent(c, MainActivity.class); open.putExtra("screen", k);
        open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(c, k.hashCode(), open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification n = new Notification.Builder(c, "checkpoints").setSmallIcon(android.R.drawable.ic_popup_reminder)
            .setContentTitle(title).setContentText(text).setStyle(new Notification.BigTextStyle().bigText(text))
            .setContentIntent(pi).setAutoCancel(true).build();
        try { nm.notify(k.hashCode(), n); } catch (SecurityException ignored) {}
    }
}
