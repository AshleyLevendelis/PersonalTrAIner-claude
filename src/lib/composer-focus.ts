/**
 * KEEPING THE PHONE KEYBOARD UP WHEN YOU SEND A MESSAGE.
 *
 * Reported from a real phone, twice: "each time I enter an input and hit send
 * the keyboard closes and I have to reopen it for the next message... which is
 * incredibly frustrating."
 *
 * A soft keyboard exists for exactly as long as a text input holds focus.
 * Tapping a <button> beside that input takes the focus away — the browser
 * assigns focus on the compatibility `mousedown` a tap synthesises — and the
 * keyboard goes with it. Measured in Chromium against the real onboarding
 * screen (`npm run verify:keyboard`): after tapping send, document.activeElement
 * was <body>. Nothing focused. On a phone that is the keyboard closing.
 *
 * The send button makes it worse than a plain blur, because emptying the box
 * flips it to `disabled` in the same tick — and a disabled element cannot hold
 * focus, so even the button is not left holding it. Focus lands nowhere.
 *
 * THE INPUT ALREADY KNEW THIS. ConversationalOnboarding's Input carries a
 * comment reading "NOT `disabled` while busy: on a phone, disabling the focused
 * input dismisses the keyboard, so the user had to re-tap the field on every
 * single turn." The lesson was learned, written down, and applied to one of the
 * two focusable controls in the composer. This is the other one — which is the
 * feature-built-in-two-halves shape this codebase keeps hitting.
 *
 * `onMouseDown` + preventDefault is the fix rather than onPointerDown: on touch,
 * `mousedown` is the compatibility event that assigns focus, and preventing it
 * suppresses the focus change WITHOUT suppressing the `click` that follows, so
 * the button still does its job. Preventing pointerdown instead can swallow the
 * click on some engines.
 *
 * Belt and braces, because this helper alone cannot cover every path: the
 * caller should also re-focus the input after sending. The phone keyboard's
 * own "Go"/Enter key is an IME action that can dismiss the keyboard with no DOM
 * event to intercept, and that path cannot be reproduced headlessly — a
 * synchronous re-focus inside the same user gesture is what keeps it up there.
 */

/**
 * Spread onto any control sitting beside a text composer — send, mic, anything
 * tappable — so tapping it does not take the keyboard away from the input.
 *
 * Deliberately not a hook or a wrapper component: it has to be trivial to add
 * to a plain <Button>, or the next composer will skip it.
 */
export const keepsComposerFocus = {
  onMouseDown: (e: { preventDefault: () => void }) => e.preventDefault(),
} as const

/**
 * Put focus back on the composer after a send, synchronously inside the user
 * gesture that sent it — that timing is what makes a phone keep (or reopen)
 * the keyboard rather than treating it as a programmatic focus it may ignore.
 *
 * Safe when the field is readOnly, which is what both composers do while the
 * coach is replying: a readOnly input still takes focus and still holds the
 * keyboard open. That is the whole reason it is readOnly rather than disabled.
 */
export function refocusComposer(el: HTMLInputElement | HTMLTextAreaElement | null): void {
  if (!el) return
  // Already focused is the common case on the Enter path — re-focusing then is
  // a no-op rather than a flicker, so there is no need to branch on it.
  el.focus({ preventScroll: true })
}
