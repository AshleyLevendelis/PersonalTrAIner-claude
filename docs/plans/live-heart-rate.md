# Live heart rate from a Bluetooth strap or watch (option 3)

His request, 24 Nov 2026: "1 + 2, build it and then start working on 3". Options 1 (after each session) and 2 (resting
heart rate on Home) read what a watch has already written to Health Connect / Apple Health. Option 3 reads the strap
DIRECTLY, while he trains, so the number is live.

## What he gets

- Profile → "Steps from your phone" → "Heart rate strap": **Find my strap** scans for anything sending heart rate (the
  standard Bluetooth heart rate service, which every chest strap and most watches in "broadcast heart rate" mode use:
  Polar, Garmin, Wahoo, Coros, Apple Watch with a broadcast app). He taps his strap; the app remembers it on this phone.
- **During a session**: the round timer, the countdown and today's workout show a small live "♥ 152" while the strap is
  in range. Nothing else changes: no zone, no target, no colour that says "too high" (CSCS, mine, and his rulings that
  effort is in words).
- **After**: the strap's own readings give the session its average and highest, into the same fields option 1 fills, so
  he needs no Health Connect for it. When both exist the strap's figure is kept (it is the session's own readings).

## Mine (measurement and CSCS)

- A reading is believed at 30-230 bpm (as option 1). A strap's "sensor contact: not detected" flag drops the reading.
- Readings are kept on the phone only while a session runs, one a second at most, and thrown away once the figure is
  saved. Never sent anywhere raw.
- Nothing is prescribed by it. The live number is information, never a target; no sentence tells him to speed up or slow
  down. Safety stays the red-flag rule: chest pain, dizziness or breathlessness is answered by the coach's existing
  "stop and see a professional", never by a heart rate rule.

## How (engineering)

- Plugin: `@capacitor-community/bluetooth-le` 8.3.0 (Capacitor 8; 8.4.0 is a week old, so not yet).
- Heart Rate Service `0x180D`, Heart Rate Measurement characteristic `0x2A37` (notify). Its first byte is flags: bit 0
  says the value is 16-bit (else 8-bit), bits 1-2 the sensor contact state (supported and not in contact = drop). Parser
  is pure (`heart-strap.ts`, `parseHeartRateMeasurement`), tested on real byte layouts.
- Android 12+: `BLUETOOTH_SCAN` (with `neverForLocation`) and `BLUETOOTH_CONNECT`; older Android needs location for a
  scan (the plugin's own manifest handles `maxSdkVersion`). iPhone: `NSBluetoothAlwaysUsageDescription` (not built: no
  iPhone app yet).
- Phone-only code loads only in the phone app (as health-steps).
- One live reader (`useLiveHeartRate`) for every screen that shows it, so the timer and the workout cannot disagree.

## Stages

1. Parser + adapter + store of readings, with a gate (cloud).
2. Profile pairing row, the live "♥" on the timer and workout, the after-session figure; a fake strap for the browser
   driver (cloud).
3. On his phone: pair a real strap, run a round, check the live number and the saved figure (his machine).

## Open, his

- The Play listing: Bluetooth permissions are new (no listing change needed for "neverForLocation" scans, but the store
  form for nearby devices may ask).
- Whether the coach is told the session's heart rate (option 1 does not tell it yet either).
