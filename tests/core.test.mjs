import test from "node:test";
import assert from "node:assert/strict";
import { differences, seeds, restoreSeeds, newTree, validateTree, copy, branchLanes, configurationKey, groupedVersions, changedText } from "../web/tree-core.mjs";

test("configuration grouping ignores numeric seeds but keeps prompt, LoRA and connections", () => {
  const a = { "1": { class_type: "KSampler", inputs: { seed: 3, cfg: 7 } }, "2": { class_type: "Text", inputs: { text: "hello" } } };
  const b = copy(a); b[1].inputs.seed = 5;
  assert.equal(configurationKey(a), configurationKey(b));
  b[2].inputs.text = "world"; assert.notEqual(configurationKey(a), configurationKey(b));
  b[2].inputs.text = "hello"; b[1].inputs.seed = ["9", 0];
  assert.notEqual(configurationKey(a), configurationKey(b));
});

test("grouped results preserve exact parents and branch geometry", () => {
  const nodes = [{ id: "a", parent: null }, { id: "b", parent: "a", groupId: "a" }, { id: "c", parent: "b", branchStart: true }];
  const before = copy(nodes), groups = groupedVersions(nodes);
  assert.equal(groups.length, 2); assert.equal(groups[0].runs.length, 2);
  assert.equal(groups[1].parent, "a"); assert.equal(nodes[2].parent, "b");
  assert.deepEqual(nodes, before);
  assert.notEqual(branchLanes(groups).lanes.get("a"), branchLanes(groups).lanes.get("c"));
});

test("full text diff preserves long prompts and handles insertion and deletion", () => {
  for (const [a,b] of [["hello world", "hello beautiful world"], ["abc", ""], ["", "abc"], ["x".repeat(500) + "day", "x".repeat(500) + "night"]]) {
    const d = changedText(a,b);
    assert.equal(d.prefix+d.removed+d.suffix,a);
    assert.equal(d.prefix+d.added+d.suffix,b);
  }
});

test("resuming version 7 after a separate version 8 draws a branch", () => {
  const { lanes } = branchLanes([{ id: "7" }, { id: "8" }, { id: "9", parent: "7" }, { id: "10", parent: "9" }]);
  assert.notEqual(lanes.get("9"), lanes.get("7"));
  assert.equal(lanes.get("10"), lanes.get("9"));
});

test("explicit continuation starts a branch even from the latest version", () => {
  const { lanes } = branchLanes([{ id: "7" }, { id: "8", parent: "7", branchStart: true }, { id: "9", parent: "8" }]);
  assert.notEqual(lanes.get("8"), lanes.get("7"));
  assert.equal(lanes.get("9"), lanes.get("8"));
});

test("snapshot keeps the executed seed when live widgets randomize", () => {
  const prompt = { "4": { class_type: "KSampler", inputs: { seed: 123, cfg: 7 } } };
  const snapshot = copy(prompt); prompt[4].inputs.seed = 999;
  assert.equal(seeds(snapshot)[0].value, 123);
  const node = { widgets: [{ name: "seed", value: 999 }, { name: "control_after_generate", value: "randomize" }] };
  const graph = { getNodeById: () => node };
  assert.deepEqual(restoreSeeds(graph, snapshot, true), { restored: 1, missing: [] });
  assert.deepEqual(node.widgets.map(w => w.value), [123, "fixed"]);
  restoreSeeds(graph, snapshot, false);
  assert.equal(node.widgets[1].value, "randomize");
  assert.ok(Number.isSafeInteger(node.widgets[0].value));
  assert.ok(node.widgets[0].value >= 0);
});
test("diff includes LoRA strength, prompt edits, links and removals", () => {
  const a = { "1": { class_type: "LoraLoader", inputs: { strength_model: 0.5 } }, "2": { class_type: "CLIPTextEncode", inputs: { text: "day", clip: ["1", 1] } } };
  const b = copy(a); b[1].inputs.strength_model = 0.8; b[2].inputs.text = "night"; b[2].inputs.clip = ["3", 1];
  assert.equal(differences(a, b).length, 3);
  delete b[1]; assert.match(differences(a, b)[0], /removed/);
});
test("tree round trip preserves branches and rejects cycles or external preview URLs", () => {
  const tree = newTree();
  tree.nodes = ["root", "a", "b"].map((id, i) => ({ id, parent: i ? "root" : null, workflow: { nodes: [] }, prompt: {}, images: [] }));
  tree.active = "b";
  assert.deepEqual(validateTree(copy(tree)), tree);
  tree.nodes[0].parent = "b"; assert.throws(() => validateTree(tree));
  tree.nodes[0].parent = null; tree.nodes[0].images.push({ preview: "https://example.com/tracker" });
  assert.throws(() => validateTree(tree));
});
test("unsupported internal seed reports missing rather than claiming restoration", () => {
  const prompt = { "10:2": { inputs: { noise_seed: 42 } } };
  assert.equal(restoreSeeds({ getNodeById: () => null }, prompt, true).missing.length, 1);
});
