package ru.orlov.trezvo;

import android.app.*;
import android.content.*;
import org.json.JSONObject;
import java.util.Calendar;

/** Одноразовые напоминания (план, «как прошло?»), лимит проактивных уведомлений в день и тихие часы. */
public class Proactive {
    static SharedPreferences prefs(Context c) { return c.getSharedPreferences("p", Context.MODE_PRIVATE); }

    static void scheduleOnce(Context c, String id, long at, String title, String text, String screen, boolean proactive) {
        try {
            JSONObject all = new JSONObject(prefs(c).getString("once", "{}"));
            JSONObject o = new JSONObject().put("at", at).put("title", title).put("text", text).put("screen", screen).put("proactive", proactive);
            all.put(id, o);
            prefs(c).edit().putString("once", all.toString()).apply();
            arm(c, id, o);
        } catch (Exception ignored) {}
    }

    static void arm(Context c, String id, JSONObject o) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, o.optLong("at"), pi(c, id, o));
    }

    static PendingIntent pi(Context c, String id, JSONObject o) {
        Intent it = new Intent(c, ReminderReceiver.class);
        it.setAction("once:" + id);
        it.putExtra("kind", "once"); it.putExtra("id", id);
        if (o != null) {
            it.putExtra("title", o.optString("title")); it.putExtra("text", o.optString("text"));
            it.putExtra("screen", o.optString("screen")); it.putExtra("proactive", o.optBoolean("proactive"));
        }
        return PendingIntent.getBroadcast(c, id.hashCode(), it, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static void cancelOnce(Context c, String id) {
        try {
            ((AlarmManager) c.getSystemService(Context.ALARM_SERVICE)).cancel(pi(c, id, null));
            JSONObject all = new JSONObject(prefs(c).getString("once", "{}"));
            all.remove(id);
            prefs(c).edit().putString("once", all.toString()).apply();
        } catch (Exception ignored) {}
    }

    static void forget(Context c, String id) {
        try {
            JSONObject all = new JSONObject(prefs(c).getString("once", "{}"));
            all.remove(id); prefs(c).edit().putString("once", all.toString()).apply();
        } catch (Exception ignored) {}
    }

    /** После перезагрузки: заново поставить будущие одноразовые напоминания. */
    static void rearm(Context c) {
        try {
            JSONObject all = new JSONObject(prefs(c).getString("once", "{}"));
            JSONObject keep = new JSONObject();
            java.util.Iterator<String> it = all.keys();
            while (it.hasNext()) {
                String id = it.next(); JSONObject o = all.getJSONObject(id);
                if (o.optLong("at") > System.currentTimeMillis()) { keep.put(id, o); arm(c, id, o); }
            }
            prefs(c).edit().putString("once", keep.toString()).apply();
        } catch (Exception ignored) {}
    }

    static void setSettings(Context c, String json) { prefs(c).edit().putString("settings", json).apply(); }

    static String today() {
        Calendar cal = Calendar.getInstance();
        return String.format(java.util.Locale.US, "%04d-%02d-%02d", cal.get(Calendar.YEAR), cal.get(Calendar.MONTH) + 1, cal.get(Calendar.DAY_OF_MONTH));
    }

    static int minutes(String hm) { String[] p = hm.split(":"); return Integer.parseInt(p[0]) * 60 + Integer.parseInt(p[1]); }

    static boolean inQuiet(JSONObject s) {
        try {
            int from = minutes(s.optString("quiet_from", "23:00")), to = minutes(s.optString("quiet_to", "09:00"));
            Calendar cal = Calendar.getInstance(); int now = cal.get(Calendar.HOUR_OF_DAY) * 60 + cal.get(Calendar.MINUTE);
            return from <= to ? (now >= from && now < to) : (now >= from || now < to);
        } catch (Exception e) { return false; }
    }

    /** Можно ли сейчас показать проактивное уведомление данного типа. Если да — засчитывает его в дневной лимит. */
    static boolean allow(Context c, String kind) {
        try {
            JSONObject s = new JSONObject(prefs(c).getString("settings", "{}"));
            if (inQuiet(s)) return false;
            String d = today();
            if (kind.equals("pre") && d.equals(s.optString("planned_date"))) return false; // уже есть план — придёт его напоминание
            int max = s.optInt("max", 2);
            String key = "cnt_" + d; int n = prefs(c).getInt(key, 0);
            if (n >= max) return false;
            prefs(c).edit().putInt(key, n + 1).apply();
            return true;
        } catch (Exception e) { return true; }
    }
}
