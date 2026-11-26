package uk.co.personaltrainerapp.wear;

/**
 * Which of five zones a heart rate sits in: tenths of the estimated maximum, the split every watch uses and the app's
 * own (src/lib/heart-series.ts zoneOf): zone 1 under 60%, 2 from 60%, 3 from 70%, 4 from 80%, 5 from 90%. Zones
 * DESCRIBE a workout; nothing on the watch prescribes one. A maximum of 0 means the phone shows no zone, and nor does
 * the watch.
 */
final class Zones {
    private Zones() {}
    private static final double[] FROM = { 0, 0.6, 0.7, 0.8, 0.9 };

    static int zoneOf(int bpm, int estimatedMax) {
        if (estimatedMax <= 0 || bpm <= 0) return 0;
        // A reading over the estimate stretches the maximum, as the phone does (LiveHeart: max(estimatedMax, bpm)).
        double share = bpm / (double) Math.max(estimatedMax, bpm);
        int z = 1;
        for (int i = 0; i < FROM.length; i++) if (share >= FROM[i]) z = i + 1;
        return z;
    }
}
