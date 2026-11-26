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
 */
final class PhoneLink {
    private PhoneLink() {}
    private static final String TAG = "PtPhoneLink";
    private static final String PREFS = "pt_outbox";
    /** About three hours of heart rate in five-second batches, plus the rest: a full outbox drops its oldest. */
    private static final int MAX_WAITING = 3000;
    private static final ExecutorService IO = Executors.newSingleThreadExecutor();
    private static final Object LOCK = new Object();

    /** Queues an event ("type" plus its fields) and tries to send everything waiting. */
    static void send(Context c, JSONObject event) {
        Context app = c.getApplicationContext();
        try {
            event.put("id", UUID.randomUUID().toString());
            event.put("sentFrom", "watch");
        } catch (Exception ignored) { /* the object is ours */ }
        synchronized (LOCK) {
            JSONArray box = read(app);
            box.put(event.toString());
            while (box.length() > MAX_WAITING) box.remove(0);
            write(app, box);
        }
        flush(app);
    }

    /** Sends whatever is waiting, oldest first, stopping at the first failure so the order holds. */
    static void flush(Context c) {
        Context app = c.getApplicationContext();
        IO.execute(() -> {
            try {
                List<Node> nodes = Tasks.await(Wearable.getNodeClient(app).getConnectedNodes(), 10, TimeUnit.SECONDS);
                Node phone = null;
                for (Node n : nodes) if (n.isNearby()) { phone = n; break; }
                if (phone == null && !nodes.isEmpty()) phone = nodes.get(0);
                if (phone == null) return; // no phone in reach: everything waits
                while (true) {
                    String next;
                    synchronized (LOCK) {
                        JSONArray box = read(app);
                        if (box.length() == 0) return;
                        next = box.getString(0);
                    }
                    Tasks.await(Wearable.getMessageClient(app).sendMessage(phone.getId(), Protocol.EVENT_PATH, next.getBytes(StandardCharsets.UTF_8)), 10, TimeUnit.SECONDS);
                    synchronized (LOCK) {
                        JSONArray box = read(app);
                        if (box.length() > 0 && box.getString(0).equals(next)) box.remove(0);
                        write(app, box);
                    }
                }
            } catch (Exception e) {
                Log.w(TAG, "send waits for the phone: " + e.getMessage());
            }
        });
    }

    static int waiting(Context c) { synchronized (LOCK) { return read(c.getApplicationContext()).length(); } }

    private static JSONArray read(Context c) {
        try { return new JSONArray(prefs(c).getString("box", "[]")); } catch (Exception e) { return new JSONArray(); }
    }
    private static void write(Context c, JSONArray box) { prefs(c).edit().putString("box", box.toString()).commit(); }
    private static SharedPreferences prefs(Context c) { return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }
}
