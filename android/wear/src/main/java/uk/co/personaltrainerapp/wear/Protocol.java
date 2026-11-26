package uk.co.personaltrainerapp.wear;

/**
 * WHAT THE WATCH AND THE PHONE SAY TO EACH OTHER (27 Nov 2026). Two roads, both over the watch's own Bluetooth link:
 *
 *  - PHONE TO WATCH, a data item at /pt/today: today's session as the phone's Exercise tab draws it (name, each
 *    exercise's sets, reps, load and rest, how many sets are done) and his estimated maximum heart rate for the zones
 *    (absent when the phone shows no zone: a health condition, pregnancy, or no age). A data item is kept by Google's
 *    layer and reaches the watch whenever it next connects, so the watch has it even if the phone app is closed.
 *  - WATCH TO PHONE, a message at /pt/event per event, JSON with a unique "id" so the phone never applies one twice:
 *    "hr" (heart rate readings, [epoch ms, bpm] pairs), "cardio-start", "cardio-end", "set" (a set ticked on the
 *    watch). Unsent events wait on the watch (PhoneLink's outbox) until the phone takes them.
 *
 * The phone's copy of these names is src/lib/wear-protocol.ts; test:watch-app holds the two together.
 */
final class Protocol {
    private Protocol() {}
    static final String TODAY_PATH = "/pt/today";
    static final String EVENT_PATH = "/pt/event";
    static final String TODAY_KEY = "json";
}
