// Tests for composer cover (src/editor.ts). Run: npm test
const { execSync } = require("child_process");
const { JSDOM } = require("jsdom");
execSync("npx esbuild src/editor.ts --bundle --format=cjs --platform=node --outfile=tests/.editor.cjs", { stdio: "ignore" });
let pass = 0, fail = 0;
const ok = (c, l) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + l); };

const dom = new JSDOM('<head></head><body><div id="e" contenteditable="true" style="color:red">hi</div></body>');
global.window = dom.window; global.document = dom.window.document;
global.HTMLElement = dom.window.HTMLElement; global.HTMLTextAreaElement = dom.window.HTMLTextAreaElement; global.HTMLInputElement = dom.window.HTMLInputElement;
const E = require("./.editor.cjs");
const el = document.getElementById("e");
el.getBoundingClientRect = () => ({ height: 28 });

const css = E.buildHideCss();
ok(css.includes('[data-skillify-hide="pending"] *') && css.includes("::selection") && css.includes("color:transparent"), "cover CSS hides all descendants + selection highlight");
ok(require("fs").readFileSync("src/content.css", "utf8").includes(css), "src/content.css contains the same rules");

const undo = E.coverEditor(el);
ok(el.getAttribute("data-skillify-hide") === "pending", "cover sets root attribute synchronously");
ok(el.style.getPropertyValue("height") === "28px" && el.style.getPropertyPriority("height") === "important", "box height locked (no visible growth)");
ok(!!document.getElementById("skillify-page-style"), "backup <style> injected");
undo();
ok(!el.hasAttribute("data-skillify-hide") && el.style.getPropertyValue("height") === "" && el.getAttribute("style").includes("color"), "uncover restores everything");

el.appendChild(document.createElement("p")); el.lastChild.textContent = "a\nb\n\n";
ok(E.readPrompt(el) === "a\nb", "readPrompt joins blocks, trims trailing newlines");
console.log(`\n${pass} passed, ${fail} failed`);
require("fs").unlinkSync("tests/.editor.cjs");
process.exit(fail ? 1 : 0);
