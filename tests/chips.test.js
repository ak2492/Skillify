// DOM tests for chip replacement (src/chips.ts) using jsdom. Run: npm test
const { execSync } = require("child_process");
const { JSDOM } = require("jsdom");
execSync("npx esbuild src/chips.ts --bundle --format=cjs --platform=node --outfile=tests/.chips.cjs", { stdio: "ignore" });
let pass = 0, fail = 0;
const ok = (c, l, x) => { c ? pass++ : (fail++, 0); console.log((c ? "PASS " : "FAIL ") + l + (!c && x ? "\n  " + x : "")); };

function run(html) {
  const dom = new JSDOM(`<body>${html}</body>`);
  global.window = dom.window; global.document = dom.window.document; global.NodeFilter = dom.window.NodeFilter;
  global.Element = dom.window.Element; global.Node = dom.window.Node; global.HTMLElement = dom.window.HTMLElement;
  delete require.cache[require.resolve("./.chips.cjs")];
  const C = require("./.chips.cjs");
  const root = document.body.firstElementChild;
  const n = C.replaceBlocks(root);
  const chips = Array.from(root.querySelectorAll("[data-skillify-chip]"));
  return { n, chips, root, text: root.textContent };
}

// 1. single text node (ChatGPT style, pre-wrap)
let r = run('<div id="m">&lt;skill : formal&gt;\nBe formal.\nNo slang.\n&lt;skill : formal&gt;\nHello there</div>');
ok(r.n === 1 && r.chips.length === 1, "single text node -> 1 chip");
ok(r.chips[0].getAttribute("data-skillify-chip") === "formal" && r.chips[0].getAttribute("data-skillify-desc") === "Be formal.\nNo slang.", "chip carries name + full description");
ok(!r.text.includes("<skill") && !r.text.includes("Be formal"), "skill text gone from visible text");
ok(r.text.includes("Hello there"), "user prompt preserved");

// 2. two skills + prompt
r = run('<div>&lt;skill : a&gt;\nAAA\n&lt;skill : a&gt;\n&lt;skill : b&gt;\nBBB\n&lt;skill : b&gt;\nMy question?</div>');
ok(r.chips[0].nextSibling === r.chips[1] || r.chips[0].nextSibling?.nodeValue === "", "chips are adjacent (same line), prompt after")
ok(r.chips.length === 2 && r.chips[0].getAttribute("data-skillify-chip") === "a" && r.chips[1].getAttribute("data-skillify-chip") === "b", "two skills -> two chips in order");
ok(r.text.replace(/[\s\u2726]/g, "").replace(/ab/, "") .includes("Myquestion?") && !r.text.includes("AAA"), "prompt kept, descriptions removed");

// 3. block split across <p> elements (Claude style)
r = run('<div><p>&lt;skill : tone&gt;</p><p>Be kind.</p><p>&lt;skill : tone&gt;</p><p>Hi!</p></div>');
ok(r.chips.length === 1 && r.chips[0].getAttribute("data-skillify-desc") === "Be kind.", "block across <p> elements -> 1 chip");
ok(!r.text.includes("Be kind") && r.text.includes("Hi!"), "other <p> text intact");

// 3b. two skills across <p>s: chips end up side by side in the first paragraph
r = run('<div><p>&lt;skill : a&gt;</p><p>AAA</p><p>&lt;skill : a&gt;</p><p>&lt;skill : b&gt;</p><p>BBB</p><p>&lt;skill : b&gt;</p><p>Question?</p></div>');
ok(r.chips.length === 2 && r.chips[0].parentElement === r.chips[1].parentElement && r.chips[0].nextElementSibling === r.chips[1], "multi-<p> skills -> chips side by side at the start");
ok(r.root.querySelector("p:last-child").textContent === "Question?", "prompt <p> untouched");

// 3c. preamble line is swallowed with the first block (all layouts), and gaps are collapsed
const PRE = "[Skills attached to this message]";
const body = "&lt;skill : skill 1&gt;\nskill 1\n&lt;skill : skill 1&gt;\n&lt;skill : skill 2&gt;\nskill 2\n&lt;skill : skill 2&gt;\ndid you receive skill ?";
r = run(`<div>${PRE}\n${body}</div>`);
ok(r.chips.length === 2 && !r.text.includes("Skills attached") && r.text.includes("did you receive skill ?"), "preamble + 2 blocks (single node) -> 2 chips, preamble gone");
r = run(`<div>${(PRE + "\n" + body).split("\n").map((l) => `<p>${l}</p>`).join("")}</div>`);
const hidden = Array.from(r.root.querySelectorAll("p")).filter((p) => p.style.display === "none").length;
ok(r.chips.length === 2 && !r.text.includes("Skills attached") && hidden >= 6, "preamble + 2 blocks (<p> lines) -> 2 chips, emptied <p>s hidden (" + hidden + ")");
r = run(`<div>${(PRE + "\n" + body).split("\n").join("<br>")}</div>`);
const brs = Array.from(r.root.querySelectorAll("br")), shown = brs.filter((b) => b.style.display !== "none").length;
ok(r.chips.length === 2 && shown === 1, "<br> layout: exactly one line break kept before the prompt (" + shown + ")");
// the failure seen on Claude: opening tag of block 1 lost -> must not mangle or crash, block 2 still chipped
r = run(`<div>\nskill 1\n&lt;skill : skill 1&gt;\n&lt;skill : skill 2&gt;\nskill 2\n&lt;skill : skill 2&gt;\nhi</div>`);
ok(r.chips.length === 1 && r.chips[0].getAttribute("data-skillify-chip") === "skill 2", "orphan closing tag: block 2 still becomes a chip");

// 4. skips editable + code
r = run('<div><div contenteditable="true">&lt;skill : x&gt;\nsecret\n&lt;skill : x&gt;</div><pre>&lt;skill : y&gt;\nz\n&lt;skill : y&gt;</pre></div>');
ok(r.n === 0 && r.chips.length === 0, "composer (contenteditable) and <pre> are never touched");

// 5. idempotent
r = run('<div>&lt;skill : a&gt;\nAAA\n&lt;skill : a&gt;\nHi</div>');
const again = require("./.chips.cjs").replaceBlocks(r.root);
ok(again === 0 && r.root.querySelectorAll("[data-skillify-chip]").length === 1, "second pass does nothing");

console.log(`\n${pass} passed, ${fail} failed`);
require("fs").unlinkSync("tests/.chips.cjs");
process.exit(fail ? 1 : 0);
