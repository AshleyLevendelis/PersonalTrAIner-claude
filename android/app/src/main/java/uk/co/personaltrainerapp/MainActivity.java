package uk.co.personaltrainerapp;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // The app's own plugin (live steps during a recorded workout), registered before the bridge starts.
        registerPlugin(StepCounterPlugin.class);
        // The watch app's link (27 Nov 2026, docs/plans/watch-app.md).
        registerPlugin(WatchBridgePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
