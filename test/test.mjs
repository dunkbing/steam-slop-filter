import { test } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import { createRequire } from "node:module";
import { parseDisclosure } from "../api/src/index.js";

const SSF = createRequire(import.meta.url)("../extension/src/shared.js");
const fixture = (f) => fs.readFileSync(new URL(`fixtures/${f}`, import.meta.url), "utf8");

test("detects AI disclosure and extracts the developer's text", () => {
  const d = parseDisclosure(fixture("ai.html"));
  assert.equal(d.ai, true);
  assert.match(d.text, /text-to-speech/);
});

test("mature-content notice is not mistaken for AI", () => {
  assert.deepEqual(parseDisclosure(fixture("mature.html")), { ai: false, text: "" });
});

test("age gate / error pages are unknown", () => {
  assert.equal(parseDisclosure("<html><div class='agegate_birthday_selector'></div></html>"), null);
});

test("verdict", () => {
  const s = { ...SSF.DEFAULTS };
  const g = (slop, legit, ai = false) => ({ slop, legit, ai });
  assert.equal(SSF.verdict(s, 1, undefined).slop, true);
  assert.equal(SSF.verdict(s, -1, g(99, 0)).slop, false);
  assert.equal(SSF.verdict(s, 0, g(2, 0)).slop, false);
  assert.equal(SSF.verdict(s, 0, g(3, 2)).slop, true);
  assert.equal(SSF.verdict(s, 0, g(3, 3)).slop, false);
  assert.equal(SSF.verdict(s, 0, g(0, 0, true)).slop, false);
  assert.equal(SSF.verdict({ ...s, disclosureIsSlop: true }, 0, g(0, 0, true)).slop, true);
});

test("appIdFromHref", () => {
  assert.equal(SSF.appIdFromHref("https://store.steampowered.com/app/2073850/THE_FINALS/?snr=1"), "2073850");
  assert.equal(SSF.appIdFromHref("/sub/123"), null);
});
