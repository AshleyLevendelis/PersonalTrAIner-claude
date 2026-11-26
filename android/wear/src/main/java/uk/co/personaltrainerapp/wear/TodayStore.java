package uk.co.personaltrainerapp.wear;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;

/**
 * TODAY'S SESSION AS THE PHONE LAST SENT IT, kept on the watch, plus the sets ticked on the watch since. The phone's
 * numbers always win (decision 3 of docs/plans/watch-app.md): the watch shows the phone's prescription and only ticks
 * it; a different weight is changed on the phone. A session for another date is never shown.
 */
final class TodayStore {
    private TodayStore() {}
    private static final String PREFS = "pt_today";

    static final class Exercise {
        String id;
        String name;
        int sets;
        String reps;      // "10", "8-12", "30s"
        String load;      // "100 kg", "20 kg per hand", "BW", "" (none)
        int restSeconds;
        int phoneDone;    // sets done as the phone last saw them
    }

    static final class Session {
        String date;
        String title;
        int estimatedMax; // 0: no zones
        final List<Exercise> exercises = new ArrayList<>();
    }

    static String today() { return new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date()); }

    static void save(Context c, String json) {
        prefs(c).edit().putString("json", json).apply();
    }

    /** His estimated maximum for the zones, from the last thing the phone sent, whatever its date; 0 for none. */
    static int estimatedMax(Context c) {
        try {
            String raw = prefs(c).getString("json", null);
            return raw == null ? 0 : new JSONObject(raw).optInt("estimatedMax", 0);
        } catch (Exception e) { return 0; }
    }

    /** Today's session, or null when the phone sent none for today. */
    static Session read(Context c) {
        try {
            String raw = prefs(c).getString("json", null);
            if (raw == null) return null;
            JSONObject o = new JSONObject(raw);
            Session s = new Session();
            s.date = o.optString("date");
            if (!today().equals(s.date)) return null;
            s.title = o.optString("title", "Today's session");
            s.estimatedMax = o.optInt("estimatedMax", 0);
            JSONArray arr = o.optJSONArray("exercises");
            if (arr == null || arr.length() == 0) return null;
            for (int i = 0; i < arr.length(); i++) {
                JSONObject e = arr.getJSONObject(i);
                Exercise x = new Exercise();
                x.id = e.optString("id");
                x.name = e.optString("name");
                x.sets = Math.max(1, e.optInt("sets", 1));
                x.reps = e.optString("reps", "");
                x.load = e.optString("load", "");
                x.restSeconds = Math.max(0, e.optInt("restSeconds", 60));
                x.phoneDone = Math.max(0, e.optInt("done", 0));
                s.exercises.add(x);
            }
            return s;
        } catch (Exception e) {
            return null;
        }
    }

    /** Sets done: the more of the phone's count and the watch's own ticks today. */
    static int done(Context c, Exercise x) {
        return Math.min(x.sets, Math.max(x.phoneDone, prefs(c).getInt(watchKey(x), 0)));
    }

    static void tick(Context c, Exercise x) {
        prefs(c).edit().putInt(watchKey(x), done(c, x) + 1).apply();
    }

    /**
     * "Next exercise" moved on from this one today with sets left (his 27 Nov 2026 flow: "Log set, Next set, Start rest
     * timer, Next exercise"). Kept on the watch only: nothing is sent, so the phone's list keeps those sets open and
     * they can still be done there. Today only.
     */
    static boolean skipped(Context c, Exercise x) { return prefs(c).getBoolean(skipKey(x), false); }

    static void skip(Context c, Exercise x) { prefs(c).edit().putBoolean(skipKey(x), true).apply(); }

    private static String watchKey(Exercise x) { return "done:" + today() + ":" + x.id; }

    private static String skipKey(Exercise x) { return "skip:" + today() + ":" + x.id; }

    private static SharedPreferences prefs(Context c) { return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }
}
