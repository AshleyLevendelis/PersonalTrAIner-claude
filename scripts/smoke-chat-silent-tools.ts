// THE COACH NEVER ANSWERS WITH NOTHING WHEN ITS TOOL CALL CAME WITH NO WORDS (his report 17 Nov 2026: "how did your
// body feel this morning?", he answered "the workout was brilliant ... my muscles are aching", and the chat said
// "That came back empty"). Runs the REAL chat-gemini function in Deno, with a fake model that sends a save call and no
// text (what Gemini does), and a fake database. Run with: npm run verify:chat-silent-tools
const realFetch = globalThis.fetch;
let script: Array<Record<string, unknown>> = [];
globalThis.fetch = async (input: any, init?: any) => {
  const url = typeof input === "string" ? input : input.url;
  if (url.includes("generativelanguage")) {
    const next = script.shift() ?? { text: "Aching after two days back is normal: your muscles are adapting, and it eases in a couple of days." };
    const parts = "call" in next ? [{ functionCall: next.call }] : [{ text: next.text }];
    return new Response(JSON.stringify({ candidates: [{ content: { role: "model", parts }, finishReason: "STOP" }], usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 } }), { headers: { "Content-Type": "application/json" } });
  }
  if (url.startsWith("http://fake-supabase")) return new Response("[]", { headers: { "Content-Type": "application/json" } });
  return realFetch(input, init);
};
Deno.env.set("GEMINI_KEY", "x"); Deno.env.set("SUPABASE_URL", "http://fake-supabase"); Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "k");
let handler: ((r: Request) => Promise<Response>) | null = null;
(Deno as any).serve = (h: any) => { handler = h; return {} as any; };
await import("../supabase/functions/chat-gemini/index.ts");
const base = JSON.parse(await Deno.readTextFile("scripts/exam-cases/_base-context.json"));

let ran = 0, failures = 0;
const check = (name: string, ok: boolean, detail: unknown = "") => { ran++; if (ok) console.log(`ok: ${name}`); else { failures++; console.log(`FAIL: ${name} ${JSON.stringify(detail).slice(0, 300)}`); } };
async function turn(message: string, calls: Array<Record<string, unknown>>) {
  script = calls;
  const res = await handler!(new Request("http://x/", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message, profile_id: "00000000-0000-0000-0000-000000000001", history: [{ role: "assistant", content: "Hey Ashley, how did your body feel this morning?" }], context: base }) }));
  return { status: res.status, body: await res.json().catch(() => ({})) as Record<string, any> };
}
const HIS = "The workout was brilliant. But where I haven't trained in so long and just got back into it these past 2 days. My muscles are aching";
const feel = (quote: string) => ({ call: { name: "record_session_feel", args: { felt: "good", date: "2026-11-17", origin_verbatim_quote: quote, felt_note: "aching" } } });

const a = await turn(HIS, [feel("The workout was brilliant")]);
check("his turn: the feel is kept AND the coach answers in words", a.status === 200 && !!a.body.feelIntent && typeof a.body.reply === "string" && a.body.reply.trim().length > 0, a.body);
const b = await turn(HIS, [feel("words he never said")]);
check("a feel the app cannot keep: still answered in words", b.status === 200 && !b.body.feelIntent && b.body.reply?.trim().length > 0, b.body);
const c = await turn("call me Ash", [{ call: { name: "set_display_name", args: { display_name: "Ash", origin_verbatim_quote: "not in the message" } } }]);
check("a name the app cannot keep: still answered in words", c.status === 200 && c.body.reply?.trim().length > 0, c.body);
const d = await turn("I walked loads today", [{ call: { name: "log_steps", args: { steps: "lots" } } }]);
check("steps the app cannot read: still answered in words", d.status === 200 && d.body.reply?.trim().length > 0, d.body);
const e = await turn(HIS, [feel("The workout was brilliant"), { text: "" }, { text: "" }, { text: "" }]);
check("the model silent on every try: the floor, never empty", e.status === 200 && e.body.reply?.trim().length > 0, e.body);
const f = await turn("how are you", [{ text: "Good, thanks. Ready for tomorrow?" }]);
check("control: a plain reply is untouched", f.body.reply === "Good, thanks. Ready for tomorrow?", f.body);

console.log(`\n${ran} checks ran.`);
if (failures > 0) { console.log(`${failures} FAILED.`); Deno.exit(1); }
console.log("All silent-tool checks passed.");
Deno.exit(0);
