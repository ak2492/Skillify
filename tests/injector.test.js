// Minimal unit tests for injector logic (mirrors src/injector.ts + dist/content.js).
// Run: node tests/injector.test.js
function buildSkillBlock(name, description) {
  return "<skill : " + (name || "").trim() + ">\n" + (description || "").trim() + "\n<skill : " + (name || "").trim() + ">";
}
function buildHeader(selected) {
  return selected.map(function (s) { return buildSkillBlock(s.name, s.description); }).join("\n");
}
var SKILL_BLOCK_RE = /<skill\s*:\s*(.+?)\s*>\s*[\s\S]*?\s*<skill\s*:\s*\1\s*>/g;
function stripAllSkillBlocks(text) {
  SKILL_BLOCK_RE.lastIndex = 0;
  return (text || "").replace(SKILL_BLOCK_RE, "").replace(/^\n+/, "");
}
function rebuildEditorText(currentFullText, selected) {
  var userPrompt = stripAllSkillBlocks(currentFullText).replace(/^\n+/, "");
  if (!selected || selected.length === 0) return userPrompt;
  var header = buildHeader(selected);
  if (!userPrompt.trim()) return header;
  return header + "\n" + userPrompt;
}

var passed = 0, failed = 0;
function eq(actual, expected, label) {
  if (actual === expected) { passed++; console.log("PASS " + label); }
  else { failed++; console.log("FAIL " + label + "\n  expected: " + JSON.stringify(expected) + "\n  actual:   " + JSON.stringify(actual)); }
}

var A = { id: "a", name: "formal-tone", description: "Always use formal language.", createdAt: 1 };
var B = { id: "b", name: "concise", description: "Keep under 80 words.", createdAt: 2 };

eq(buildSkillBlock("formal-tone", "Always use formal language."),
  "<skill : formal-tone>\nAlways use formal language.\n<skill : formal-tone>",
  "buildSkillBlock exact format");

eq(rebuildEditorText("", [A]),
  "<skill : formal-tone>\nAlways use formal language.\n<skill : formal-tone>",
  "empty editor + 1 skill");

eq(rebuildEditorText("Write an email about leave.", [A, B]),
  "<skill : formal-tone>\nAlways use formal language.\n<skill : formal-tone>\n<skill : concise>\nKeep under 80 words.\n<skill : concise>\nWrite an email about leave.",
  "prompt-first + 2 skills in order A,B");

eq(rebuildEditorText("Write an email about leave.", [B, A]),
  "<skill : concise>\nKeep under 80 words.\n<skill : concise>\n<skill : formal-tone>\nAlways use formal language.\n<skill : formal-tone>\nWrite an email about leave.",
  "order B,A preserved");

// Deselect middle: current has A+B+prompt, now only A selected -> B removed, order kept
var full = rebuildEditorText("Hello.", [A, B]);
eq(rebuildEditorText(full, [A]),
  "<skill : formal-tone>\nAlways use formal language.\n<skill : formal-tone>\nHello.",
  "deselect B removes only B block");

// No duplication on re-render
eq(rebuildEditorText(full, [A, B]), full, "re-render same selection is idempotent");

// Deselect all -> prompt only
eq(rebuildEditorText(full, []), "Hello.", "deselect all returns prompt");

// Every block starts on new line (header joined by \n, header + \n + prompt)
var two = rebuildEditorText("P.", [A, B]);
eq(two.indexOf("\n<skill : concise>") !== -1, true, "second skill starts on new line");
eq(two.endsWith("\nP."), true, "prompt starts on new line after header");

console.log("\n" + passed + " passed, " + failed + " failed");
process.exit(failed ? 1 : 0);
