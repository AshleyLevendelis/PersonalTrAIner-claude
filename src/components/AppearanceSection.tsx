// ---------------------------------------------------------------------------
// The Appearance sheet.
//
// WHY IT IS SHAPED LIKE THIS. There are 5 themes x 6 accents x 3 glow levels
// = 90 combinations, and they used to be chosen from inside a dialog that
// covers the app it is repainting. You picked blind and found out afterwards.
// So the controls sit under a live preview of the real Home, painted from the
// tokens the choice actually sets — a bad pairing is visible before it is
// committed rather than after.
//
// THE BUG THIS ALSO FIXES. `accent: 'theme'` was the stored default and the
// type allowed it, but ACCENT_OPTIONS listed only the five hues, so there was
// no control anywhere that returned you to your theme's own accent. Tap one
// and it was permanent short of clearing localStorage. "Match theme" is now
// the first chip, and its swatch shows the CURRENT theme's accent, so it
// changes as the theme does.
// ---------------------------------------------------------------------------
import { Check, RotateCcw, AlertTriangle } from 'lucide-react'
import type { GlowLevel } from '@/lib/appearance-store'
import { DEFAULT_APPEARANCE, isLightTheme } from '@/lib/appearance-store'
import {
  THEME_PREVIEWS, ACCENT_PREVIEWS, THEME_ORDER, ACCENT_ORDER,
  resolveAccentColor, contrastRatio, CONTRAST_FLOOR,
} from '@/lib/appearance-palette'
import type { AppearanceController } from '@/hooks/useAppearance'

const GLOW_LEVELS: GlowLevel[] = ['off', 'subtle', 'full']

/**
 * A static, representative sample of Home painted in the pending combination.
 *
 * Deliberately NOT the real Dashboard component: this must render five themes
 * it is not wearing, from explicit colours rather than from the cascade, and
 * pulling in the real one would drag the whole data layer into a settings
 * sheet. What it must get right is the RELATIONSHIPS — accent on canvas,
 * figure on surface, muted against both — because those are what a bad pair
 * breaks.
 */
function HomePreview({ theme, accent, glow }: { theme: typeof THEME_ORDER[number]; accent: typeof ACCENT_ORDER[number]; glow: GlowLevel }) {
  const t = THEME_PREVIEWS[theme]
  const a = resolveAccentColor(theme, accent)
  const strength = glow === 'off' ? 0 : glow === 'subtle' ? 0.5 : 1
  const halo = strength === 0 ? undefined : `0 0 ${Math.round(18 * strength)}px ${a}${Math.round(strength * 90).toString(16).padStart(2, '0')}`
  return (
    <div
      className="overflow-hidden rounded-xl p-3"
      style={{ background: t.canvas, color: t.text, border: `1px solid ${t.hairline}` }}
      aria-hidden="true"
    >
      <div className="flex items-center justify-between">
        <span className="text-[0.625rem] uppercase tracking-widest" style={{ color: t.muted }}>Wednesday</span>
        <span className="inline-flex items-center gap-1 rounded-full px-2 py-[3px] text-[0.625rem]" style={{ background: t.surface }}>
          <span className="inline-block size-[5px] rounded-full" style={{ background: a }} />
          <span style={{ color: t.text }}>12 day streak</span>
        </span>
      </div>
      <div className="mt-2 flex gap-[3px]">
        {['✓', '✓', '◐', '○', '–', '○', '·'].map((g, i) => (
          <span key={i} className="flex h-[18px] flex-1 items-center justify-center rounded-[5px] text-[0.5625rem]"
            style={{ background: i < 3 ? t.surface : 'transparent', border: `1px solid ${i === 2 ? a : 'transparent'}`, color: t.muted }}>{g}</span>
        ))}
      </div>
      <p className="mt-2.5 text-[0.9375rem] font-semibold" style={{ color: t.text }}>Full Body Power</p>
      <p className="text-[0.6875rem]" style={{ color: t.muted }}>6 exercises · ~52 min</p>
      <div className="mt-2 flex h-[30px] items-center justify-center rounded-[9px] text-[0.75rem] font-semibold"
        style={{ background: a, color: t.light ? '#FFFFFF' : t.canvas, boxShadow: halo }}>
        Start session
      </div>
      <div className="mt-2.5 flex items-baseline gap-1.5">
        <span className="text-[1.25rem] font-semibold tabular-nums" style={{ color: t.text }}>86.0</span>
        <span className="text-[0.625rem]" style={{ color: t.muted }}>kg · −1.2 since week 1</span>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-1.5">
        {[['1,840', 'kcal'], ['1.4', 'litres'], ['5,720', 'steps']].map(([n, l], i) => (
          <div key={l} className="rounded-[9px] px-2 py-1.5" style={{ background: t.surface }}>
            <p className="text-[0.75rem] font-semibold tabular-nums" style={{ color: t.text }}>{n}</p>
            <p className="text-[0.5625rem]" style={{ color: t.muted }}>{l}</p>
            <div className="mt-1 h-[2px] rounded-full" style={{ background: t.hairline }}>
              {/* Water is --chart-3 everywhere and never moves with the accent:
                  status must not depend on a cosmetic choice. */}
              <div className="h-full rounded-full" style={{ width: '60%', background: i === 1 ? '#5AA9E6' : a }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function AppearanceSection({ appearance }: { appearance: AppearanceController }) {
  const { theme, accent, glow } = appearance
  const t = THEME_PREVIEWS[theme]
  const resolved = resolveAccentColor(theme, accent)
  const ratio = contrastRatio(resolved, t.canvas)
  const lowContrast = ratio < CONTRAST_FLOOR
  const glowClamped = isLightTheme(theme) && glow === 'full'
  // What the preview and the sample dot must show — the glow actually applied,
  // not the glow stored, or Daylight would preview a halo it will not paint.
  const effectiveGlow: GlowLevel = glowClamped ? 'subtle' : glow
  const isDefault = theme === DEFAULT_APPEARANCE.theme && accent === DEFAULT_APPEARANCE.accent && glow === DEFAULT_APPEARANCE.glow

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Appearance</h3>
      <div className="space-y-4 rounded-md bg-[color:var(--surface-deep)] p-3">

        <div>
          <p className="text-[0.6875rem] uppercase tracking-wide text-muted-foreground">Preview</p>
          <div className="mt-2">
            <HomePreview theme={theme} accent={accent} glow={effectiveGlow} />
          </div>
        </div>

        {/* THEME — cards, not chips. A 22px swatch cannot show what a theme
            does to text on a surface, which is the thing being chosen. */}
        <div>
          <p className="text-sm font-medium">Theme</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Sets canvas, surfaces and text. Complete stays green and attention stays amber in every theme, so status never depends on your pick.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {THEME_ORDER.map(name => {
              const p = THEME_PREVIEWS[name]
              const active = theme === name
              // Each card previews the theme WITH the accent currently chosen,
              // so the pair is judged together rather than one at a time.
              const cardAccent = resolveAccentColor(name, accent)
              return (
                <button
                  key={name}
                  type="button"
                  aria-pressed={active}
                  onClick={() => appearance.setTheme(name)}
                  className="rounded-xl p-2.5 text-left hit-slop-44"
                  style={{
                    background: p.canvas,
                    border: `1px solid ${active ? cardAccent : p.hairline}`,
                    boxShadow: active ? `0 0 0 1px ${cardAccent}` : undefined,
                  }}
                >
                  <span className="flex items-center justify-between">
                    <span className="text-[0.8125rem] font-semibold" style={{ color: p.text }}>{p.label}</span>
                    {active && (
                      <span className="flex size-[16px] items-center justify-center rounded-full" style={{ background: cardAccent }}>
                        <Check className="size-2.5" style={{ color: p.light ? '#FFFFFF' : p.canvas }} />
                      </span>
                    )}
                  </span>
                  <span className="mt-1.5 block h-[20px] rounded-md" style={{ background: p.surface }} />
                  <span className="mt-1.5 flex items-center gap-1.5">
                    <span className="h-[6px] flex-1 rounded-full" style={{ background: cardAccent }} />
                    <span className="size-[12px] rounded-[4px]" style={{ background: p.surface }} />
                  </span>
                  <span className="mt-1.5 block text-[0.625rem]" style={{ color: p.muted }}>{p.subtitle}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* ACTION COLOUR — names visible, not aria-label-only. A row of
            unlabelled swatches asks you to remember which is which. */}
        <div>
          <p className="text-sm font-medium">Action colour</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Buttons, links and the chat key. Defaults to your theme — override it here.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {ACCENT_ORDER.map(value => {
              const a = ACCENT_PREVIEWS[value]
              const active = accent === value
              // 'theme' has no colour of its own, so its swatch shows the
              // theme's accent and moves when the theme does.
              const swatch = resolveAccentColor(theme, value)
              const glowRgb = a.glowRgb ?? '255,255,255'
              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => appearance.setAccent(value)}
                  className="inline-flex min-h-[38px] items-center gap-2 rounded-full px-3 text-[0.75rem]"
                  style={{
                    background: active ? `rgba(${glowRgb},.14)` : 'var(--surface-raised)',
                    border: `1px solid ${active ? `rgba(${glowRgb},.65)` : 'transparent'}`,
                  }}
                >
                  <span className="size-[16px] shrink-0 rounded-full" style={{ background: swatch }} />
                  <span>{a.label}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* CONTRAST GUARD — warn, never block. It is their app; the app's job
            is to say what it can see, not to overrule taste. */}
        {lowContrast && (
          <p className="flex items-start gap-2 rounded-md p-2 text-[0.71875rem] leading-[1.5]"
             style={{ background: 'rgba(var(--role-warn-rgb, 245 158 11) / .10)', color: 'var(--role-warn-text)' }}>
            <AlertTriangle className="mt-[1px] size-3.5 shrink-0" />
            <span>
              {ACCENT_PREVIEWS[accent].label === 'Match theme' ? t.label : ACCENT_PREVIEWS[accent].label} sits at {ratio.toFixed(1)}:1 against {t.label}&apos;s canvas — under the {CONTRAST_FLOOR}:1 floor for a button you have to find.
            </span>
          </p>
        )}

        {/* GLOW — with a live sample, because "subtle" and "full" are not
            words anyone can picture. */}
        <div>
          <p className="text-sm font-medium">Glow</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Halos on the action button, active states and key numbers
            {glowClamped && <span className="text-[color:var(--role-warn-text)]"> — clamped to subtle on {t.label}</span>}
          </p>
          <div className="mt-3 flex items-center gap-2">
            <div className="flex flex-1 gap-[3px] rounded-xl bg-background p-[3px]">
              {GLOW_LEVELS.map(level => (
                <button
                  key={level}
                  type="button"
                  aria-pressed={glow === level}
                  onClick={() => appearance.setGlow(level)}
                  className={`h-[38px] flex-1 rounded-[9px] text-[0.8125rem] capitalize transition-colors ${
                    glow === level ? 'font-semibold text-[color:var(--primary-foreground)]' : 'text-muted-foreground'
                  }`}
                  style={glow === level ? { background: 'linear-gradient(180deg, color-mix(in oklab, var(--primary) 84%, white), var(--primary-2))' } : undefined}
                >
                  {level}
                </button>
              ))}
            </div>
            <span className="flex size-[38px] shrink-0 items-center justify-center rounded-xl" style={{ background: 'var(--surface-raised)' }}>
              <span
                className="size-[9px] rounded-full"
                style={{
                  background: resolved,
                  boxShadow: effectiveGlow === 'off' ? undefined
                    : `0 0 ${effectiveGlow === 'full' ? 14 : 7}px ${resolved}`,
                }}
              />
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t pt-3" style={{ borderColor: 'var(--hairline)' }}>
          <p className="text-[0.71875rem] leading-[1.5] text-muted-foreground">
            {t.label} · {accent === 'theme' ? 'theme accent' : `${ACCENT_PREVIEWS[accent].label.toLowerCase()} accent`} · glow {effectiveGlow}
          </p>
          <button
            type="button"
            onClick={appearance.reset}
            disabled={isDefault}
            className="inline-flex min-h-[38px] shrink-0 items-center gap-1.5 rounded-full px-3 text-[0.75rem] text-muted-foreground disabled:opacity-40"
            style={{ background: 'var(--surface-raised)' }}
          >
            <RotateCcw className="size-3" />
            Reset
          </button>
        </div>
      </div>
    </div>
  )
}
