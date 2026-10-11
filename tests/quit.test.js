/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const parentScript = fs.readFileSync(path.join(__dirname, "../parent.js"), "utf8");

async function exercise(shape) {
  let resolveModern;
  let resolveLegacy;
  const modern = new Promise(resolve => { resolveModern = resolve; });
  const legacy = new Promise(resolve => { resolveLegacy = resolve; });
  const interfaces = {
    legacy: { idleTasksFinishedPromise: legacy },
    modern: { idleTasksFinished: { promise: modern } },
    both: {
      idleTasksFinished: { promise: modern },
      idleTasksFinishedPromise: legacy,
    },
    modernEmptyWithLegacy: {
      idleTasksFinished: {},
      idleTasksFinishedPromise: legacy,
    },
    missing: {},
    invalid: { idleTasksFinished: { promise: {} } },
  };
  let browserWindow = { gBrowserInit: interfaces[shape] };
  if (shape === "noWindow") {
    browserWindow = null;
  } else if (shape === "noBrowserInit") {
    browserWindow = {};
  }

  const quitModes = [];
  const context = vm.createContext({
    ExtensionAPI: class {},
    Services: {
      wm: { getMostRecentWindow: () => browserWindow },
      startup: { quit: mode => quitModes.push(mode) },
    },
    Ci: { nsIAppStartup: { eForceQuit: 3 } },
  });
  vm.runInContext(parentScript, context);
  const quitter = new context.quitter().getAPI({}).quitter;
  let error = null;
  const completed = quitter.quit().catch(reason => { error = reason; });
  await Promise.resolve();
  await Promise.resolve();

  if (shape === "missing" || shape === "invalid") {
    await completed;
    assert(error);
    assert.match(error.message, /browser startup promise is unavailable/);
    assert.deepStrictEqual(quitModes, []);
    return;
  }
  if (shape === "noWindow" || shape === "noBrowserInit") {
    await completed;
    assert.strictEqual(error, null);
    assert.deepStrictEqual(quitModes, [3]);
    return;
  }

  assert.deepStrictEqual(quitModes, [], "must not quit while startup is pending");
  if (shape === "both") {
    resolveLegacy();
    await Promise.resolve();
    await Promise.resolve();
    assert.deepStrictEqual(quitModes, [], "must prefer the modern startup promise");
  }
  resolveModern();
  resolveLegacy();
  await completed;
  assert.strictEqual(error, null);
  assert.deepStrictEqual(quitModes, [3], "must quit exactly once after startup");
}

async function main() {
  const shapes = [
    "legacy", "modern", "both", "modernEmptyWithLegacy",
    "missing", "invalid", "noWindow", "noBrowserInit",
  ];
  for (const shape of shapes) {
    await exercise(shape);
    console.log("PASS " + shape);
  }
}

// A pending Promise alone does not keep Node running. Fail rather than silently
// exit successfully if a regression leaves one of these waits unresolved.
const testDeadline = setTimeout(() => {
  console.error("Timed out waiting for Quitter tests to finish");
  process.exitCode = 1;
}, 5000);
main().catch(error => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => clearTimeout(testDeadline));
