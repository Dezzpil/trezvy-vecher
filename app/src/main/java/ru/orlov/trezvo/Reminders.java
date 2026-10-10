package ru.orlov.trezvo;

import android.app.*;
import android.content.*;
import org.json.JSONArray;
import java.util.Calendar;

public class Reminders {
    static final String DEF = "[{\"t\":\"10:00\",\"k\":\"morning\"},{\"t\":\"16:30\",\"k\":\"afternoon\"},{\"t\":\"19:00\",\"k\":\"evening\"},{\"t\":\"22:30\",\"k\":\"night\"}]";
    static void schedule(Context c) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        try {
            JSONArray old = new JSONArray(DEF);
            for (int i = 0; i < 8; i++) am.cancel(pi(c, i, ""));
            JSONArray a = new JSONArray(c.getSharedPreferences("r", Context.MODE_PRIVATE).getString("times", DEF));
            for (int i = 0; i < a.length(); i++) {
                if (!a.getJSONObject(i).optBoolean("on", true)) continue;
                String[] hm = a.getJSONObject(i).getString("t").split(":");
                Calendar cal = Calendar.getInstance();
                cal.set(Calendar.HOUR_OF_DAY, Integer.parseInt(hm[0])); cal.set(Calendar.MINUTE, Integer.parseInt(hm[1])); cal.set(Calendar.SECOND, 0);
                if (cal.getTimeInMillis() < System.currentTimeMillis()) cal.add(Calendar.DAY_OF_YEAR, 1);
                am.setInexactRepeating(AlarmManager.RTC_WAKEUP, cal.getTimeInMillis(), AlarmManager.INTERVAL_DAY, pi(c, i, a.getJSONObject(i).getString("k")));
            }
        } catch (Exception ignored) {}
    }
    static PendingIntent pi(Context c, int i, String kind) {
        Intent it = new Intent(c, ReminderReceiver.class); it.putExtra("kind", kind);
        return PendingIntent.getBroadcast(c, 100 + i, it, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
}
