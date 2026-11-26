package uk.co.personaltrainerapp;

import com.google.android.gms.wearable.MessageEvent;
import com.google.android.gms.wearable.WearableListenerService;

import java.nio.charset.StandardCharsets;

/** The watch's events (path /pt/event) arrive here, app open or not, and wait in WatchInbox for the app. */
public class PhoneWatchListenerService extends WearableListenerService {
    @Override
    public void onMessageReceived(MessageEvent event) {
        if (!"/pt/event".equals(event.getPath())) return;
        WatchInbox.add(this, new String(event.getData(), StandardCharsets.UTF_8));
        WatchBridgePlugin.somethingWaiting();
    }
}
