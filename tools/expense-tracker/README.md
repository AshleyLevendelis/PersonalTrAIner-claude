# Trip Spend Ledger

A standalone personal expense tracker, unrelated to the PersonalTrAIner product.
It lives here only so the source is version-controlled; it is not imported by the
app, not part of the Vite build, and ships nothing to Vercel or Supabase.

**Live page:** https://claude.ai/code/artifact/ebb48151-8990-45ab-81ae-e4bf7dc9b55e

## What it does

Logs an expense in three taps — amount, category, card — and keeps a running
monthly total.

- Categories: Hotel, Flights, Food, Taxi, Misc
- Cards: Amex, Halifax debit, Halifax credit
- Date defaults to today, with Today / Yesterday shortcuts
- Optional note per entry
- Month-by-month navigation, spend split by category and by card
- Edit and delete any entry
- CSV export of the month being viewed

## How it's hosted

It is published as a Claude Artifact, not deployed by this repo. `index.html` is
the artifact *source*: the publish step wraps it in a
`<!doctype html><head></head><body>` skeleton, which is why the file has no
`<html>`, `<head>` or `<body>` tags of its own. Opening it directly in a browser
therefore renders, but without the runtime capabilities below.

Two capabilities are declared at publish time:

- `db` — expenses are stored server-side per artifact, so they survive reloads,
  republishes and a change of phone. Documents live at `expenses/<id>`.
- `downloads` — the CSV export.

To republish after editing, from a Claude Code session:

```
Artifact(file_path: "tools/expense-tracker/index.html",
         url: "https://claude.ai/code/artifact/ebb48151-8990-45ab-81ae-e4bf7dc9b55e")
```

Passing the `url` is what keeps the existing link and the stored expenses.
Publishing without it creates a second, empty artifact.

## Offline behaviour

If the store can't be reached, entries are written to `localStorage` and shown
with a "not synced" marker rather than being lost. They are pushed up the next
time the page loads with the store available.

## Currency

Amounts are GBP only — there is no currency field and no conversion. Foreign
spend has to be entered in pounds.
