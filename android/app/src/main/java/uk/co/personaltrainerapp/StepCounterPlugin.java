package uk.co.personaltrainerapp;

import android.Manifest;
import android.content.Context;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.os.Build;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * LIVE STEPS DURING A RECORDED WORKOUT (his words 27 Nov 2026: "While the exercise is running I should be able to see
 * my heart rate and the zone and steps if applicable"). Health Connect is filled by Samsung Health minutes or hours
 * late, so the live count comes from the phone's own step counter (Sensor.TYPE_STEP_COUNTER), which counts steps since
 * the phone started and updates within seconds. The app keeps the count at Start and shows the difference
 * (src/lib/live-steps.ts). Nothing is stored here and nothing is written anywhere.
 *
 * Android 10 and later ask for "Physical activity" (ACTIVITY_RECOGNITION) the first time; it is not a Health Connect
 * permission. A refusal or a phone with no step counter resolves started: false, and the walk is still timed.
 */
@CapacitorPlugin(
    name = "StepCounter",
    permissions = { @Permission(strings = { Manifest.permission.ACTIVITY_RECOGNITION }, alias = "activity") }
)
public class StepCounterPlugin extends Plugin implements SensorEventListener {

    private SensorManager sensors;
    private boolean listening = false;
    private float lastTotal = -1f;

    private Sensor counter() {
        if (sensors == null) sensors = (SensorManager) getContext().getSystemService(Context.SENSOR_SERVICE);
        return sensors == null ? null : sensors.getDefaultSensor(Sensor.TYPE_STEP_COUNTER);
    }

    @PluginMethod
    public void isAvailable(PluginCall call) {
        JSObject r = new JSObject();
        r.put("available", counter() != null);
        call.resolve(r);
    }

    @PluginMethod
    public void start(PluginCall call) {
        if (counter() == null) {
            resolveStarted(call, false, "unavailable");
            return;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && getPermissionState("activity") != PermissionState.GRANTED) {
            requestPermissionForAlias("activity", call, "activityPermissionCallback");
            return;
        }
        begin(call);
    }

    @PermissionCallback
    private void activityPermissionCallback(PluginCall call) {
        if (getPermissionState("activity") == PermissionState.GRANTED) begin(call);
        else resolveStarted(call, false, "denied");
    }

    private void begin(PluginCall call) {
        Sensor s = counter();
        if (!listening && s != null) listening = sensors.registerListener(this, s, SensorManager.SENSOR_DELAY_NORMAL);
        resolveStarted(call, listening, listening ? null : "unavailable");
    }

    private void resolveStarted(PluginCall call, boolean started, String reason) {
        JSObject r = new JSObject();
        r.put("started", started);
        if (reason != null) r.put("reason", reason);
        if (lastTotal >= 0) r.put("total", (double) lastTotal);
        call.resolve(r);
    }

    @PluginMethod
    public void stop(PluginCall call) {
        if (listening && sensors != null) sensors.unregisterListener(this);
        listening = false;
        call.resolve();
    }

    @Override
    public void onSensorChanged(SensorEvent event) {
        if (event == null || event.sensor == null || event.sensor.getType() != Sensor.TYPE_STEP_COUNTER || event.values.length == 0) return;
        lastTotal = event.values[0];
        JSObject d = new JSObject();
        d.put("total", (double) lastTotal);
        d.put("at", System.currentTimeMillis());
        notifyListeners("step", d);
    }

    @Override
    public void onAccuracyChanged(Sensor sensor, int accuracy) {}

    @Override
    protected void handleOnDestroy() {
        if (listening && sensors != null) sensors.unregisterListener(this);
        listening = false;
    }
}
