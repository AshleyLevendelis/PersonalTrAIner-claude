package uk.co.personaltrainerapp.wear;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.RadialGradient;
import android.graphics.RectF;
import android.graphics.Shader;
import android.view.View;

/**
 * THE SCREEN'S BACKGROUND AND ITS EDGE RING (27 Nov 2026, the high-end pass). A round watch is framed by its edge, so
 * progress lives there, the way the app's Home rings carry the day: a faint track all the way round, and an arc from
 * twelve o'clock in the colour of what it measures, with a soft glow. Mint for sets done, violet for a rest running
 * down, the heart's coral for the zone (zone N of 5). Behind it, the app's violet, lit a little above the centre and
 * falling to near black at the edge (dark pixels cost an OLED screen nothing).
 */
public class RingView extends View {
    private final Paint track = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint arc = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint glow = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint bg = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final RectF box = new RectF();
    private float fraction;
    private int color = WatchStyle.MINT;
    private int lastW, lastH;

    public RingView(Context c) {
        super(c);
        float d = c.getResources().getDisplayMetrics().density;
        track.setStyle(Paint.Style.STROKE);
        track.setStrokeWidth(3.5f * d);
        track.setColor(WatchStyle.TRACK);
        arc.setStyle(Paint.Style.STROKE);
        arc.setStrokeWidth(3.5f * d);
        arc.setStrokeCap(Paint.Cap.ROUND);
        glow.setStyle(Paint.Style.STROKE);
        glow.setStrokeWidth(9f * d);
        glow.setStrokeCap(Paint.Cap.ROUND);
    }

    /** How much of the ring is lit (0 to 1), and in which colour. */
    void set(float fraction, int color) {
        float f = Math.max(0f, Math.min(1f, fraction));
        if (f == this.fraction && color == this.color) return;
        this.fraction = f;
        this.color = color;
        invalidate();
    }

    @Override
    protected void onDraw(Canvas canvas) {
        int w = getWidth(), h = getHeight();
        if (w != lastW || h != lastH) {
            lastW = w; lastH = h;
            float r = Math.max(w, h) * 0.62f;
            bg.setShader(new RadialGradient(w / 2f, h * 0.36f, r,
                    new int[] { WatchStyle.BG_GLOW, WatchStyle.BG, WatchStyle.BG_EDGE },
                    new float[] { 0f, 0.55f, 1f }, Shader.TileMode.CLAMP));
        }
        canvas.drawRect(0, 0, w, h, bg);
        float inset = glow.getStrokeWidth() / 2f + 2f;
        box.set(inset, inset, w - inset, h - inset);
        canvas.drawArc(box, 0, 360, false, track);
        if (fraction <= 0f) return;
        float sweep = 360f * fraction;
        glow.setColor((color & 0x00FFFFFF) | 0x38000000);
        arc.setColor(color);
        canvas.drawArc(box, -90, sweep, false, glow);
        canvas.drawArc(box, -90, sweep, false, arc);
    }
}
