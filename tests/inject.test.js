// buildInjection / findSkillBlock with the preamble. Run: npm test
const { execSync } = require("child_process");
execSync("npx esbuild src/injector.ts --bundle --format=cjs --platform=node --outfile=tests/.inj.cjs", { stdio: "ignore" });
const I = require("./.inj.cjs");
let pass = 0, fail = 0;
const ok = (c, l) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + l); };
const skills = [{ name: "skill 1", description: "skill 1" }, { name: "skill 2", description: "skill 2" }];
const inj = I.buildInjection(skills);
ok(inj.split("\n")[0] === I.SKILL_PREAMBLE, "injection starts with the preamble line");
ok(inj.endsWith(I.buildHeader(skills)), "injection ends with the exact blocks");
const m = I.findSkillBlock(inj + "\nhello");
ok(m && m.name === "skill 1" && m.start === 0, "first match includes the preamble (start 0)");
const m2 = I.findSkillBlock(inj, m.end);
ok(m2 && m2.name === "skill 2", "second block found after the first");
ok(I.findSkillBlock("[Skills attached to this message]\nno blocks here") === null, "preamble alone is not a block");
console.log(`\n${pass} passed, ${fail} failed`);
require("fs").unlinkSync("tests/.inj.cjs");
process.exit(fail ? 1 : 0);
