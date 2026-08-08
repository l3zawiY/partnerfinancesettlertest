#!/usr/bin/env node
/*
 * Headless test harness.
 *
 * The app is one HTML file with no build step, so there's nothing to import. This
 * script pulls the DOM-free parts out of the <script> block and runs the same
 * assertions the in-browser self-test runs.
 *
 * That works only because the engine is deliberately DOM-free. If you add DOM access
 * inside the ==ENGINE-START== / ==ENGINE-END== markers, this breaks — put it in the
 * app section instead.
 *
 *   node test/run-tests.js            all-green -> exit 0, any failure -> exit 1
 *   node test/run-tests.js --verbose  print passing assertions too
 */

"use strict";

var fs = require("fs");
var path = require("path");

var VERBOSE = process.argv.indexOf("--verbose") !== -1 || process.argv.indexOf("-v") !== -1;

function findApp() {
  var root = path.resolve(__dirname, "..");
  var candidates = ["index.html", "split-ledger.html"];
  for (var i = 0; i < candidates.length; i++) {
    var p = path.join(root, candidates[i]);
    if (fs.existsSync(p)) return p;
  }
  var found = fs.readdirSync(root).filter(function (f) { return /\.html$/.test(f); });
  if (found.length === 1) return path.join(root, found[0]);
  throw new Error("Could not find the app HTML file in " + root);
}

function slice(source, startMarker, endMarker) {
  var a = source.indexOf(startMarker);
  var b = source.indexOf(endMarker);
  if (a === -1 || b === -1 || b < a) {
    throw new Error("Could not locate '" + startMarker + "' .. '" + endMarker + "'. " +
      "Did the section markers in the HTML change?");
  }
  return source.slice(a, b);
}

function main() {
  var appPath = findApp();
  var html = fs.readFileSync(appPath, "utf8");

  var scriptMatch = html.match(/<script>([\s\S]*)<\/script>/);
  if (!scriptMatch) throw new Error("No <script> block found in " + appPath);
  var js = scriptMatch[1];

  // Engine + fixtures + self-test: everything before the app state object.
  var stateAt = js.indexOf("var state = {");
  if (stateAt === -1) throw new Error("Could not find 'var state = {' — has the app structure changed?");
  var head = js.slice(0, stateAt).replace(/^\s*"use strict";/, "");

  // pairFor lives in the app section but is pure and is exercised by the refund tests.
  var pairFor = slice(js, "function pairFor(", "function pairRefunds(");

  // Minimal document stub: the only DOM the self-test touches is a source-text scan.
  var documentStub = { documentElement: { outerHTML: html } };

  var exported = {};
  var factory = new Function(
    "exports", "document",
    head + "\n" + pairFor + "\nexports.runSelfTest = runSelfTest;\nexports.VERSION = VERSION;"
  );
  factory(exported, documentStub);

  var results = exported.runSelfTest();
  var passed = results.filter(function (t) { return t.ok; });
  var failed = results.filter(function (t) { return !t.ok; });

  console.log("split-ledger v" + exported.VERSION + "  (" + path.basename(appPath) + ")\n");

  results.forEach(function (t) {
    if (t.ok && !VERBOSE) return;
    var mark = t.ok ? "  PASS " : "  FAIL ";
    var line = mark + pad(t.id, 7) + t.label;
    if (!t.ok) line += "\n         got: " + t.actual + "\n        want: " + t.expected;
    console.log(line);
  });

  if (failed.length) {
    console.log("\n" + failed.length + " of " + results.length + " assertions FAILED.");
    console.log("Revert the change rather than loosening the assertion — see CLAUDE.md.");
    process.exit(1);
  }

  console.log((VERBOSE ? "\n" : "") + passed.length + " / " + results.length + " assertions passed.");
  process.exit(0);
}

function pad(s, n) {
  s = String(s);
  while (s.length < n) s += " ";
  return s;
}

try {
  main();
} catch (err) {
  console.error("Harness error: " + err.message);
  process.exit(1);
}
