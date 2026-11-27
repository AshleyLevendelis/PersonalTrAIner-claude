package uk.co.personaltrainerapp.wear;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;

import com.google.android.gms.tasks.Tasks;
import com.google.android.gms.wearable.Node;
import com.google.android.gms.wearable.Wearable;

import org.json.JSONArray;
import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

/**
 * EVERYTHING THE WATCH TELLS THE PHONE GOES THROUGH HERE, AND NOTHING IS LOST WHEN THE PHONE IS AWAY (W1 (c) of
 * docs/plans/watch-app.md: a phone left in a locker still gets the whole workout afterwards). Each event is written to
 * an outbox on the watch first, then sent; it leaves the outbox only once the phone's link has taken it. A failed send
 * is tried again on the next event and whenever a screen opens. Events carry a unique id, so a resend the phone has
 * already seen is ignored there.
 *
 * A LONG TIME AWAY COSTS LITTLE (27 Nov 2026, the watch leftovers): heart rate that piles up while the phone is out of
 * reach is folded into one waiting message (never the one being sent), one send runs at a time rather than one per
 * event, and the phone's next "today" (it sends one whenever its app opens) sends whatever waited.
 */
final class PhoneLink {
    private PhoneLink() {}
    private static final String TAG = "PtPhoneLink";
    private static final String PREFS = "pt_outbox";
    /** About three hours of heart rate in five-second batches, plus the rest: a full outbox drops its oldest. */
    private static final int MAX_WAITING = 3000;
    private static final ExecutorService IO = Executors.newSingleThreadExecutor();
    private static final Object LOCK = new Object();
    /** Heart rate readings one waiting message may hold before a new one starts (about 15 minutes at one a second). */
    static final int MAX_SAMPLES_PER_MESSAGE = 900;
    private static final java.util.concurrent.atomic.AtomicBoolean SENDING = new java.util.concurrent.atomic.AtomicBoolean(false);

    /** Queues an event ("type" plus its fields) and tries to send everything waiting. */
    static void send(Context c, JSONObject event) {
        Context app = c.getApplicationContext();
        try {
            event.put("id", UUID.randomUUID().toString());
            event.put("sentFrom", "watch");
        } catch (Exception ignored) { /* the object is ours */ }
        synchronized (LOCK) {
            JSONArray box = read(app);
            // FOLDED INTO THE LAST WAITING HEART RATE MESSAGE when it is of the same workout and is not the one that may
            // be on its way (the first): the send loop only ever takes the first, so the last is safe to change.
            JSONObject merged = box.length() >= 2 ? fold(box.optString(box.length() - 1), event) : null;
            boolean folded = false;
            if (merged != null) {
                try { box.put(box.length() - 1, merged.toString()); folded = true; }
                catch (Exception e) { /* not folded: it goes as its own message instead */ }
            }
            if (!folded) box.put(event.toString());
            while (box.length() > MAX_WAITING) box.remove(0);
            write(app, box);
        }
        flush(app);
    }

    /** `next` added to the waiting heart rate message `tail`, or null when they are not the same workout's heart rate. */
    static JSONObject fold(String tail, JSONObject next) {
        try {
            if (!"hr".equals(next.optString("type"))) return null;
            JSONObject t = new JSONObject(tail);
            if (!"hr".equals(t.optString("type")) || t.optBoolean("final")) return null;
            if (t.optLong("startedAt") != next.optLong("startedAt") || !t.optString("kind").equals(next.optString("kind"))) return null;
            JSONArray a = t.optJSONArray("samples"), b = next.optJSONArray("samples");
            if (a == null || b == null || a.length() + b.length() > MAX_SAMPLES_PER_MESSAGE) return null;
            for (int i = 0; i < b.length(); i++) a.put(b.get(i));
            if (next.has("kcal")) t.put("kcal", next.get("kcal")); // the latest count
            if (next.optBoolean("final")) t.put("final", true);
            t.put("id", next.getString("id")); // a new message: the phone has never seen this id
            return t;
        } catch (Exception e) {
            return null;
        }
    }

    /** Sends whatever is waiting, oldest first, stopping at the first failure so the order holds. One send at a time. */
    static void flush(Context c) {
        Context app = c.getApplicationContext();
        if (!SENDING.compareAndSet(false, true)) return; // the running send carries on through everything waiting
        IO.execute(() -> {
            boolean sentAll = false;
            try {
                List<Node> nodes = Tasks.await(Wearable.getNodeClient(app).getConnectedNodes(), 10, TimeUnit.SECONDS);
                Node phone = null;
                for (Node n : nodes) if (n.isNearby()) { phone = n; break; }
                if (phone == null && !nodes.isEmpty()) phone = nodes.get(0);
                if (phone == null) return; // no phone in reach: everything waits
                while (true) {
                    String next = null;
                    synchronized (LOCK) {
                        JSONArray box = read(app);
                        if (box.length() == 0) { sentAll = true; break; }
                        next = box.getString(0);
                    }
                    if (next == null) break;
                    Tasks.await(Wearable.getMessageClient(app).sendMessage(phone.getId(), Protocol.EVENT_PATH, next.getBytes(StandardCharsets.UTF_8)), 10, TimeUnit.SECONDS);
                    synchronized (LOCK) {
                        JSONArray box = read(app);
                        if (box.length() > 0 && box.getString(0).equals(next)) box.remove(0);
                        write(app, box);
                    }
                }
            } catch (Exception e) {
                Log.w(TAG, "send waits for the phone: " + e.getMessage());
            } finally {
                SENDING.set(false);
            }
            // An event queued while the last send was finishing would wait for the next one: send it now. (When the
            // phone is out of reach this returns at once: the node lookup finds no phone and nothing is sent.)
            if (sentAll && waiting(app) > 0) flush(app);
        });
    }

    static int waiting(Context c) { synchronized (LOCK) { return read(c.getApplicationContext()).length(); } }

    private static JSONArray read(Context c) {
        try { return new JSONArray(prefs(c).getString("box", "[]")); } catch (Exception e) { return new JSONArray(); }
    }
    private static void write(Context c, JSONArray box) { prefs(c).edit().putString("box", box.toString()).commit(); }
    private static SharedPreferences prefs(Context c) { return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }
}
