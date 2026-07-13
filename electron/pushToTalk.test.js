"use strict";

const test = require("node:test");
const assert = require("node:assert");

const { isRegisterableGlobalAccelerator } = require("./pushToTalk");

test("rejects modifier-only global accelerators", () => {
  for (const accelerator of [
    "Alt",
    "Option",
    "Shift",
    "CommandOrControl",
    "CmdOrCtrl",
    "Command",
    "Control",
    "Ctrl",
    "Super",
    "Meta",
    "Alt+Shift",
    "Command+Control",
    "CommandOrControl+Alt+Shift",
    "",
    "   ",
    "+",
    "Alt+",
  ]) {
    assert.strictEqual(
      isRegisterableGlobalAccelerator(accelerator),
      false,
      `expected invalid: ${JSON.stringify(accelerator)}`,
    );
  }
});

test("accepts accelerators with a non-modifier key", () => {
  for (const accelerator of [
    "Alt+Space",
    "Option+Space",
    "CommandOrControl+Shift+Space",
    "F12",
    "Space",
  ]) {
    assert.strictEqual(
      isRegisterableGlobalAccelerator(accelerator),
      true,
      `expected valid: ${JSON.stringify(accelerator)}`,
    );
  }
});

test(
  "Alt+Space is registerable on darwin",
  { skip: process.platform !== "darwin" },
  () => {
    assert.strictEqual(isRegisterableGlobalAccelerator("Alt+Space"), true);
  },
);
