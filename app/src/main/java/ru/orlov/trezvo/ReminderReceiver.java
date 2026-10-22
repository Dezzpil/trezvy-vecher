package ru.orlov.trezvo;

import android.app.*;
import android.content.*;

public class ReminderReceiver extends BroadcastReceiver {
    static final String[] PLAN = {
        "Как хочется провести вечер? Пока решение не принято — выбери пару идей.",
        "Сегодня вечером хочется тишины, компании или чего-нибудь необычного?",
        "Минута на план вечера: чего тебе будет не хватать?"
    };
    @Override public void onReceive(Context c, Intent in) {
        String k = in.getStringExtra("kind"); if (k == null) k = "";
        String title, text, screen = k; String channel = "checkpoints";
        int day = java.util.Calendar.getInstance().get(java.util.Calendar.DAY_OF_YEAR);
        switch (k) {
            case "morning": title = "Утренний чекпоинт"; text = "Как ты сегодня? Отметь настроение и план на вечер."; break;
            case "afternoon": title = "Вторая половина дня"; text = "Обычно здесь появляется мысль о вечере. Что ты хочешь с себя снять?"; break;
            case "evening": title = "Время снять плащ"; text = "Твой перерыв без дежурства. Сначала ритуал, потом решения."; break;
            case "plan":
                if (!Proactive.allow(c, "plan")) return;
                title = "План вечера"; text = PLAN[day % PLAN.length]; channel = "proactive"; break;
            case "pre":
                if (!Proactive.allow(c, "pre")) return;
                title = "Скоро вечер"; text = "Как хочешь его начать? Есть пара простых идей."; channel = "proactive"; break;
            case "once": {
                String id = in.getStringExtra("id");
                if (id != null) Proactive.forget(c, id);
                if (in.getBooleanExtra("proactive", false) && !Proactive.allow(c, "once")) return;
                title = in.getStringExtra("title"); text = in.getStringExtra("text"); screen = in.getStringExtra("screen");
                if (title == null || screen == null) return;
                channel = "proactive"; k = "once:" + id; break;
            }
            default: title = "Итог дня"; text = "Две минуты: как прошёл вечер? Запись голосом тоже подойдёт."; k = "night"; screen = "night";
        }
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        nm.createNotificationChannel(new NotificationChannel("checkpoints", "Чекпоинты", NotificationManager.IMPORTANCE_HIGH));
        nm.createNotificationChannel(new NotificationChannel("proactive", "Предложения на вечер", NotificationManager.IMPORTANCE_DEFAULT));
        Intent open = new Intent(c, MainActivity.class); open.putExtra("screen", screen);
        open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(c, k.hashCode(), open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification n = new Notification.Builder(c, channel).setSmallIcon(android.R.drawable.ic_popup_reminder)
            .setContentTitle(title).setContentText(text).setStyle(new Notification.BigTextStyle().bigText(text))
            .setContentIntent(pi).setAutoCancel(true).build();
        try { nm.notify(k.hashCode(), n); } catch (SecurityException ignored) {}
    }
}
