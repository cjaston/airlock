import { test } from "node:test";
import assert from "node:assert/strict";
import { checkSimilarity, editDistance } from "../dist/core/similarity.js";

test("typosquat: one char off a popular npm package", () => {
  assert.deepEqual(checkSimilarity("expresss", "npm"), {
    kind: "typosquat",
    target: "express",
  });
});

test("mashup: popular package + filler token", () => {
  assert.deepEqual(checkSimilarity("lodash-utils", "npm"), {
    kind: "mashup",
    target: "lodash",
  });
});

test("no false positive on legit popular packages", () => {
  assert.equal(checkSimilarity("react-redux", "npm"), null);
  assert.equal(checkSimilarity("react-router-dom", "npm"), null);
  assert.equal(checkSimilarity("requests", "pypi"), null);
});

test("pypi typosquat (missing letter)", () => {
  assert.deepEqual(checkSimilarity("reqests", "pypi"), {
    kind: "typosquat",
    target: "requests",
  });
});

test("unrelated name is not flagged", () => {
  assert.equal(checkSimilarity("my-cool-internal-tool", "npm"), null);
});

test("editDistance basics", () => {
  assert.equal(editDistance("kitten", "sitting"), 3);
  assert.equal(editDistance("abc", "abc"), 0);
  assert.equal(editDistance("express", "expresss"), 1);
});
