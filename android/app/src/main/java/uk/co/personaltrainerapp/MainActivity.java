package uk.co.personaltrainerapp;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // The app's own plugin (live steps during a recorded workout), registered before the bridge starts.
        registerPlugin(StepCounterPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
