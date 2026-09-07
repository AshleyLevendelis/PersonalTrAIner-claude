# Exercise demonstration images

Empty on purpose. Nothing here yet, and the app is honest about that: an
exercise with no `demo_image` renders no image slot at all (see
`ExerciseDetailDialog.tsx`), so an empty folder is a valid, shipped state
rather than a missing dependency.

## Why the files live here rather than on a vendor's CDN

`public/sw.js` never caches anything cross-origin — the check is one line
(`if (url.origin !== self.location.origin) return`) and it is deliberate. An
image pulled from a licensor's CDN is therefore a blank rectangle in a
basement gym with no signal, which is exactly the situation VISION.md says
the app has to work in.

Served from here it is same-origin, so the service worker's
stale-while-revalidate branch puts it in `ASSET_CACHE` the first time it is
viewed. No precache list to maintain, nothing added to the install, and it
works offline from the second view onwards.

This is the property the 5 Sep 2026 decision cited when it chose a
hand-rolled muscle map over a bought image set. Self-hosting is what buys it
back — so **never hot-link, and never put a URL in `demo_image`.** The field
takes a filename precisely so it cannot carry a host.

## Adding a set

1. Check the coverage first: `npm run check:demo-coverage -- <names-file>`,
   where `<names-file>` is one exercise name per line from the vendor's
   catalogue. It prints what matches our 199, what does not, and the
   near-misses worth mapping by hand. Do this **before** paying.
2. Drop the files in here. Web-friendly formats only (`.webp`, `.png`,
   `.jpg`, `.gif`, `.svg`) — they are served as-is.
3. Set `demo_image` on the matching `EXERCISE_DATABASE` entry to the bare
   filename, and `demo_image_credit` where the licence asks for attribution.
4. `npm run test:exercise-demo` checks every filename resolves to a real file
   and carries no host.

## Licensing

Whatever is added here has to be licensed for commercial use in a shipped
app, and the licence has to permit self-hosting. A set that only allows
hot-linking from the vendor's CDN cannot be used: see above.
