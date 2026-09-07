# Buying the demonstrations

**For Ashley. Written 7 Sep 2026. Nothing has been bought.**

You said the anatomical body was not what you had in mind, and that you had
asked for exercise demos and realistic images. That is a fair reading of what
shipped, and fairer than it looks — see "what actually happened" below. You
chose a licensed image set, and then chose "wire it up ready" when the costs
were put in front of you. The wiring is done and pushed. This is the part
that needs your money and therefore your decision.

---

## What actually happened on 5 Sep

The decision that day was a muscle map on every exercise **plus a video on the
ones a person had checked**. Both halves were built. Only the first was
filled in.

`demo_video_id` is set on **zero of 199** exercises. The "Watch demonstration"
button renders only where a video id exists, so nothing is broken and nothing
lies — but nothing appears either. So you asked for demonstrations and got a
schematic, which is what you said.

The muscle map was hand-rolled SVG rather than bought artwork for one stated
reason, and it is a reason that still holds:

> the service worker deliberately never caches anything cross-origin, so
> anything fetched from elsewhere is blank on a gym floor with no signal

That is true, and it is one line of code (`public/sw.js:70`). **It does not
rule out buying a set — it rules out hot-linking one.** Any images we buy get
copied into the app's own folder, and the service worker then caches them on
first view with no extra work. That is exactly how the wiring has been built,
and there is a check that fails if anyone ever puts a vendor's web address in
the field instead of a filename.

---

## The options

Prices are as published on the vendors' own pages. **I could not open the
sites directly** — the network here blocks them — so these came from search
results and should be confirmed on the vendor's checkout before you pay.
Treat them as indicative.

| | What you get | Price | Fit |
|---|---|---|---|
| **MoveKit** | 412 exercises, 3D animated, working muscles highlighted | **$299 one-time**, "Complete" pack, commercial rights included | Best value by a wide margin. Animated, which is closer to a demonstration than a still. |
| **WorkoutLabs** | 679 exercises, hand-drawn, anatomically reviewed | **$1,200/year**, or **$3,500+** to own outright. Their API is $195 plus $50/month | Closest to the Hevy look in the screenshots you sent. Four times the price to own, and the subscription is a recurring bill for something that never changes. |
| **RepDB** | Illustrations plus exercise data and short loops | One-time, no subscription — **price not confirmed** | Worth a look only if the first two disappoint. I could not find a figure I trust. |

**Recommendation: MoveKit, at $299 one-time.** It covers our catalogue twice
over, the licence includes commercial use, animation beats a still for showing
a movement, and it is a single payment. WorkoutLabs is prettier in the style
you liked, and I do not think it is four to eleven times prettier.

---

## Do this before paying

The headline counts (412, 679) are both bigger than our 199, which makes
coverage look settled. It is not the question. What matters is whether their
**names** map to ours — a set of 679 with no "Trap Bar Deadlift" leaves a hole
exactly where someone most wants a picture.

There is now a tool for this. Get the vendor's exercise list (most publish
one; a sample pack will do), save it as a plain text file with one name per
line, and run:

```
npm run check:demo-coverage -- their-list.txt
```

It prints how many of our 199 they cover, which they miss, and which misses
are only a naming difference — those are cheap to fix by hand. **Run it before
you buy.** If a set covers less than about 90% with nothing close for the
rest, it is the wrong set regardless of price.

---

## What happens after you buy

Short version: drop the files in a folder, set one field per exercise, done.
The app already knows what to do with them — an exercise with an image shows
it above the muscle map, an exercise without one shows exactly what it shows
today. There is no further build.

Full steps are in `public/exercise-demos/README.md`, and there is a prompt for
your local Claude Code session at the bottom of this document.

---

## One thing to check in the licence

It has to allow **self-hosting**. Some vendors licence images on condition you
load them from their servers, which for us means blank rectangles in any gym
with bad signal — the one place the app has to work. If a licence only permits
hot-linking, that set is unusable no matter how good it looks.

---

## Prompt for your machine, once you have the files

```
The exercise demo images are bought and unzipped at <path on my machine>.
Wire them into the app.

Context: the socket already exists and shipped on 7 Sep 2026 — an ExerciseEntry
carries an optional `demo_image` (a bare FILENAME, never a URL) and an optional
`demo_image_credit`, and ExerciseDetailDialog renders the image above the muscle
map when the field is set. Files must be self-hosted at public/exercise-demos/,
because public/sw.js never caches cross-origin and a hot-linked image is blank
in a gym with no signal.

Steps:
1. Run `npm run check:demo-coverage -- <the vendor's exercise list>` and show me
   the output BEFORE changing anything. If coverage is below 90%, stop and tell
   me — I may have bought the wrong set.
2. Copy the image files into public/exercise-demos/. Web formats only
   (.webp/.png/.jpg/.gif/.svg).
3. Set `demo_image` on each matching entry in src/lib/exercise-db.ts to the bare
   filename. Set `demo_image_credit` only where the licence requires attribution.
4. Run `npm run test:exercise-demo`. It checks every filename resolves to a file
   that actually exists and carries no host. It must be green.
5. Run `npm run build`, then commit and push to a claude/ branch.

What proves it worked: test:exercise-demo prints a non-zero count on the line
"N of 199 exercises have a licensed image". If it still says 0, the field was
not set — a green run alone does not prove anything happened, because zero
images is a legitimate pass.

Do not merge to main and do not deploy. Tell me the number and the branch.
```
