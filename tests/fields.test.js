// The skill form fields must be real light-DOM inputs (so pages treat them as editable). Run: npm test
const { execSync } = require("child_process");
const { JSDOM } = require("jsdom");
let pass = 0, fail = 0;
const ok = (c, l) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + l); };
const src = require("fs").readFileSync("src/ui.ts", "utf8");
ok(src.includes('<slot name="skillify-name"></slot>') && src.includes('<slot name="skillify-desc"></slot>'), "form markup uses slots, not shadow inputs");
ok(!/<input class="skillify-name"|<textarea class="skillify-desc"/.test(src), "no inputs/textarea inside the shadow template");
ok(/host\.append\(nameInput, descInput\)/.test(src), "fields appended to host light DOM");
ok(src.includes("KEEP_PRIVATE") && src.includes("e.stopPropagation()"), "keystrokes stopped at host");
// Behavioural: a light-DOM input inside a shadow host reports itself (not the host) as the event target.
const dom = new JSDOM("<body></body>");
const d = dom.window.document;
const host = d.createElement("div"); d.body.appendChild(host);
const sh = host.attachShadow({ mode: "open" }); sh.innerHTML = '<slot name="a"></slot>';
const input = d.createElement("input"); input.slot = "a"; host.appendChild(input);
let seen = null; d.addEventListener("keydown", (e) => { seen = e.target; });
input.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "a", bubbles: true, composed: true }));
ok(seen === input, "page-level listener sees a real <input> target");
let leaked = false; host.addEventListener("keydown", (e) => e.stopPropagation()); d.addEventListener("keydown", () => { leaked = true; });
input.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "a", bubbles: true, composed: true }));
ok(!leaked, "host-level stopPropagation hides keystrokes from bubble-phase page handlers");
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
