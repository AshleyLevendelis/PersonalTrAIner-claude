package uk.co.personaltrainerapp;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * WHAT THE WATCH SENT, KEPT ON THE PHONE UNTIL THE APP TAKES IT (27 Nov 2026, docs/plans/watch-app.md). The watch's
 * messages reach PhoneWatchListenerService even with the app closed; the app's web side is not running then, so each
 * event waits here and the app takes them all when it next opens (WatchBridgePlugin.drain). An event the phone has
 * already kept (the same "id", a resend from the watch) is ignored.
 */
final class WatchInbox {
    private WatchInbox() {}
    private static final String PREFS = "pt_watch_inbox";
    private static final int MAX_KEPT = 5000;
    private static final int IDS_REMEMBERED = 2000;
    private static final Object LOCK = new Object();

    static void add(Context c, String json) {
        synchronized (LOCK) {
            try {
                String id = new JSONObject(json).optString("id", "");
                SharedPreferences p = prefs(c);
                JSONArray seen = new JSONArray(p.getString("seen", "[]"));
                for (int i = 0; i < seen.length(); i++) if (id.length() > 0 && id.equals(seen.getString(i))) return;
                JSONArray box = new JSONArray(p.getString("box", "[]"));
                box.put(json);
                while (box.length() > MAX_KEPT) box.remove(0);
                if (id.length() > 0) seen.put(id);
                while (seen.length() > IDS_REMEMBERED) seen.remove(0);
                p.edit().putString("box", box.toString()).putString("seen", seen.toString()).commit();
            } catch (Exception ignored) { /* not an event of ours */ }
        }
    }

    /** Everything waiting, oldest first, and the inbox emptied. */
    static JSONArray take(Context c) {
        synchronized (LOCK) {
            SharedPreferences p = prefs(c);
            JSONArray box;
            try { box = new JSONArray(p.getString("box", "[]")); } catch (Exception e) { box = new JSONArray(); }
            p.edit().putString("box", "[]").commit();
            return box;
        }
    }

    private static SharedPreferences prefs(Context c) { return c.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE); }
}
