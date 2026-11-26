package uk.co.personaltrainerapp.wear;

import com.google.android.gms.wearable.DataEvent;
import com.google.android.gms.wearable.DataEventBuffer;
import com.google.android.gms.wearable.DataMapItem;
import com.google.android.gms.wearable.WearableListenerService;

/** Keeps the phone's latest "today" on the watch (Protocol: /pt/today), even while the watch app is closed. */
public class TodayListenerService extends WearableListenerService {
    @Override
    public void onDataChanged(DataEventBuffer events) {
        for (DataEvent e : events) {
            if (e.getType() != DataEvent.TYPE_CHANGED) continue;
            if (!Protocol.TODAY_PATH.equals(e.getDataItem().getUri().getPath())) continue;
            String json = DataMapItem.fromDataItem(e.getDataItem()).getDataMap().getString(Protocol.TODAY_KEY);
            if (json != null) TodayStore.save(this, json);
        }
        MainActivity.refreshIfOpen();
    }
}
