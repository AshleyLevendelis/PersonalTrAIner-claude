package uk.co.personaltrainerapp;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.tasks.Tasks;
import com.google.android.gms.wearable.Node;
import com.google.android.gms.wearable.PutDataMapRequest;
import com.google.android.gms.wearable.PutDataRequest;
import com.google.android.gms.wearable.Wearable;

import org.json.JSONArray;

import java.lang.ref.WeakReference;
import java.util.List;
import java.util.concurrent.TimeUnit;

/**
 * THE PHONE APP'S SIDE OF THE WATCH (27 Nov 2026, docs/plans/watch-app.md). Three things, read and called by
 * src/lib/watch-bridge.ts:
 *  - publishToday: today's session as the Exercise tab draws it, put where the watch reads it (/pt/today).
 *  - drain: every event the watch sent since the app last asked (heart rate, a cardio start or end, a set ticked).
 *  - "waiting": told to the app the moment the watch sends something while the app is open.
 *  - status: whether a watch is connected, for Profile.
 * Nothing is stored beyond the inbox, and nothing leaves the phone: the app logs what the watch sends as its own.
 */
@CapacitorPlugin(name = "WatchBridge")
public class WatchBridgePlugin extends Plugin {
    private static WeakReference<WatchBridgePlugin> live = new WeakReference<>(null);

    @Override
    public void load() { live = new WeakReference<>(this); }

    static void somethingWaiting() {
        WatchBridgePlugin p = live.get();
        if (p != null) p.notifyListeners("waiting", new JSObject());
    }

    @PluginMethod
    public void publishToday(PluginCall call) {
        String json = call.getString("json");
        if (json == null) { call.reject("no json"); return; }
        PutDataMapRequest req = PutDataMapRequest.create("/pt/today");
        req.getDataMap().putString("json", json);
        // A data item that has not changed is not resent; the time makes each publish a change.
        req.getDataMap().putLong("at", System.currentTimeMillis());
        PutDataRequest put = req.asPutDataRequest().setUrgent();
        Wearable.getDataClient(getContext()).putDataItem(put)
            .addOnSuccessListener(item -> call.resolve())
            .addOnFailureListener(e -> call.reject(e.getMessage()));
    }

    @PluginMethod
    public void drain(PluginCall call) {
        JSONArray box = WatchInbox.take(getContext());
        JSArray events = new JSArray();
        for (int i = 0; i < box.length(); i++) {
            try { events.put(new JSObject(box.getString(i))); } catch (Exception ignored) { /* skip a bad one */ }
        }
        JSObject out = new JSObject();
        out.put("events", events);
        call.resolve(out);
    }

    @PluginMethod
    public void status(PluginCall call) {
        new Thread(() -> {
            JSObject out = new JSObject();
            try {
                List<Node> nodes = Tasks.await(Wearable.getNodeClient(getContext()).getConnectedNodes(), 5, TimeUnit.SECONDS);
                out.put("connected", !nodes.isEmpty());
                out.put("name", nodes.isEmpty() ? null : nodes.get(0).getDisplayName());
            } catch (Exception e) {
                // No Google Play services or no Wear OS app on the phone: no watch, said plainly.
                out.put("connected", false);
            }
            call.resolve(out);
        }).start();
    }
}
