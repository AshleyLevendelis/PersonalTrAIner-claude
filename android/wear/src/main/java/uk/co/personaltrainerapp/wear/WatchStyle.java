package uk.co.personaltrainerapp.wear;

import android.content.Context;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.RippleDrawable;

/**
 * THE APP'S LOOK ON THE WATCH (27 Nov 2026, his words: "the aesthetic of the watch doesn't match the app. the watch needs
 * to look more high end"). The app's own default theme (src/index.css, Nightshift): deep violet, mint for what to do,
 * violet for rest, the heart's coral, Space Grotesk for words and a monospace for numbers (so a 9 and a 0 are the same
 * width as the clock runs), the app's own icons (lucide). One place, so every screen draws from the same values.
 */
final class WatchStyle {
    private WatchStyle() {}

    static final int BG = Color.parseColor("#1A1636");
    static final int BG_GLOW = Color.parseColor("#2C2560");
    static final int BG_EDGE = Color.parseColor("#0B0920");
    static final int FG = Color.parseColor("#F5F3FF");
    static final int NUM = Color.parseColor("#E4FCF4");
    static final int MUTED = Color.parseColor("#9A93C9");
    static final int BORDER = Color.parseColor("#453C8E");
    static final int SURFACE = Color.argb(71, 69, 60, 142);
    static final int HAIRLINE = Color.argb(28, 245, 243, 255);
    static final int MINT = Color.parseColor("#5BE9C2");
    static final int MINT_2 = Color.parseColor("#3ED3AA");
    static final int ON_MINT = Color.parseColor("#08281F");
    static final int VIOLET = Color.parseColor("#8B7BFF");
    static final int HEART = Color.parseColor("#FF5C7A");
    static final int TRACK = Color.argb(115, 69, 60, 142);

    private static Typeface medium, semibold, bold, mono;

    static Typeface medium(Context c) { if (medium == null) medium = load(c, R.font.space_grotesk_medium, Typeface.DEFAULT); return medium; }
    static Typeface semibold(Context c) { if (semibold == null) semibold = load(c, R.font.space_grotesk_semibold, Typeface.DEFAULT_BOLD); return semibold; }
    static Typeface bold(Context c) { if (bold == null) bold = load(c, R.font.space_grotesk_bold, Typeface.DEFAULT_BOLD); return bold; }
    static Typeface mono(Context c) { if (mono == null) mono = load(c, R.font.jetbrains_mono_bold, Typeface.MONOSPACE); return mono; }

    private static Typeface load(Context c, int id, Typeface fallback) {
        try { return c.getResources().getFont(id); } catch (Exception e) { return fallback; }
    }

    /** The main action: the app's mint pill, lit from above, with a ripple. */
    static RippleDrawable primaryPill(float radius) {
        GradientDrawable fill = new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM, new int[] { MINT, MINT_2 });
        fill.setCornerRadius(radius);
        return new RippleDrawable(ColorStateList.valueOf(Color.argb(60, 255, 255, 255)), fill, null);
    }

    /**
     * The edge button's fill (28 Nov 2026): the app's mint, lit from above, square, so the round screen's own curve
     * gives it its shape; a ripple across the whole of it.
     */
    static RippleDrawable edgeFill() {
        GradientDrawable fill = new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM, new int[] { MINT, MINT_2 });
        return new RippleDrawable(ColorStateList.valueOf(Color.argb(60, 255, 255, 255)), fill, null);
    }

    /**
     * A number to tap in the set line: a short line under it in the border colour, so it reads as pressable without a
     * box round it (his mock); a rounded ripple the size of the touch area.
     */
    static RippleDrawable tapUnderline(int thickness, int bottomInset, int sideInset) {
        GradientDrawable line = new GradientDrawable();
        line.setColor(BORDER);
        line.setCornerRadius(thickness);
        android.graphics.drawable.LayerDrawable layer = new android.graphics.drawable.LayerDrawable(new android.graphics.drawable.Drawable[] { line });
        layer.setLayerGravity(0, android.view.Gravity.BOTTOM | android.view.Gravity.FILL_HORIZONTAL);
        layer.setLayerHeight(0, thickness);
        layer.setLayerInsetBottom(0, bottomInset);
        layer.setLayerInsetLeft(0, sideInset);
        layer.setLayerInsetRight(0, sideInset);
        GradientDrawable mask = new GradientDrawable();
        mask.setCornerRadius(24f * 3);
        mask.setColor(Color.WHITE);
        return new RippleDrawable(ColorStateList.valueOf(Color.argb(40, 255, 255, 255)), layer, mask);
    }

    /** A quiet action: an outline in the app's border colour. */
    static RippleDrawable ghostPill(float radius, float stroke) {
        GradientDrawable fill = new GradientDrawable();
        fill.setCornerRadius(radius);
        fill.setColor(Color.TRANSPARENT);
        fill.setStroke(Math.round(stroke), BORDER);
        GradientDrawable mask = new GradientDrawable();
        mask.setCornerRadius(radius);
        mask.setColor(Color.WHITE);
        return new RippleDrawable(ColorStateList.valueOf(Color.argb(40, 255, 255, 255)), fill, mask);
    }

    /** A tile: the app's raised surface with its hairline. */
    static RippleDrawable tile(float radius, float stroke) {
        GradientDrawable fill = new GradientDrawable();
        fill.setCornerRadius(radius);
        fill.setColor(SURFACE);
        fill.setStroke(Math.max(1, Math.round(stroke)), HAIRLINE);
        return new RippleDrawable(ColorStateList.valueOf(Color.argb(40, 255, 255, 255)), fill, null);
    }

    /** A small outlined chip ("ZONE 4"). */
    static GradientDrawable chip(int color, float radius, float stroke) {
        GradientDrawable g = new GradientDrawable();
        g.setCornerRadius(radius);
        g.setColor(Color.TRANSPARENT);
        g.setStroke(Math.max(1, Math.round(stroke)), Color.argb(115, Color.red(color), Color.green(color), Color.blue(color)));
        return g;
    }

    /** A filled circle behind an icon, the accent at 12%. */
    static GradientDrawable iconDisc(int accent) {
        GradientDrawable g = new GradientDrawable();
        g.setShape(GradientDrawable.OVAL);
        g.setColor(Color.argb(31, Color.red(accent), Color.green(accent), Color.blue(accent)));
        return g;
    }
}
