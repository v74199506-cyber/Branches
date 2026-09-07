import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { copy, groupedVersions } from "../web/tree-core.mjs";

test("queue integration isolates workflows, groups repeats and preserves restored-result branches", async () => {
  const elements = [];
  class Element {
    constructor(tag) { this.tagName = tag; this.children = []; this.style = { setProperty() {} }; this.classList = { add() {}, toggle() {}, remove() {} }; this.attrs = {}; elements.push(this); }
    append(...items) { for (const item of items) { item.parentElement = this; this.children.push(item); } }
    replaceChildren(...items) { this.children = []; this.append(...items); }
    setAttribute(k,v) { this.attrs[k] = v; }
    addEventListener() {}
    querySelector() { return null; }
    showModal() {}
    close() {}
    focus() {}
  }
  const files = new Map(), listeners = new Map();
  let extension, count = 0;
  const prompt = (id, seed = 1, text = "day") => ({ workflow: { id, nodes: [] }, output: { "1": { class_type: "KSampler", inputs: { seed, cfg: 7, text } } } });
  let current = prompt("workflow-a");
  const app = { registerExtension(e) { extension = e; }, graphToPrompt: async () => copy(current), loadGraphData: async workflow => { current.workflow = copy(workflow); extension.afterConfigureGraph(); }, graph: { getNodeById: () => ({ widgets: [{ name: "seed", value: 1 }, { name: "control_after_generate", value: "randomize" }] }) } };
  const api = {
    queuePrompt: async () => ({ prompt_id: `job-${++count}` }),
    storeUserData: async (path, value) => { files.set(path, copy(value)); },
    getUserData: async path => ({ ok: files.has(path), status: files.has(path) ? 200 : 404, json: async () => copy(files.get(path)) }),
    listUserDataFullInfo: async () => [...files.keys()].map(path => ({ path: path.split("/").at(-1) })),
    fetchApi: async url => ({ ok: true, json: async () => url === "/queue" ? { queue_running: [], queue_pending: [] } : {} }),
    addEventListener(name, cb) { listeners.set(name, cb); },
  };
  const originals = {};
  const mocks = { document: { createElement: tag => new Element(tag), createElementNS: (_,tag) => new Element(tag), querySelector: () => null, body: new Element("body"), head: new Element("head") }, localStorage: { getItem: () => null, setItem() {} }, MutationObserver: class { observe() {} }, ResizeObserver: class { observe() {} disconnect() {} }, requestAnimationFrame: () => {}, setInterval: () => {}, __noxApp: app, __noxApi: api };
  for (const [key,value] of Object.entries(mocks)) { originals[key] = globalThis[key]; globalThis[key] = value; }
  try {
    let source = await readFile(new URL("../web/nox-trees.js", import.meta.url), "utf8");
    source = source.replace('import { app } from "../../scripts/app.js";', 'const app = globalThis.__noxApp;').replace('import { api } from "../../scripts/api.js";', 'const api = globalThis.__noxApi;').replace('"./tree-core.mjs"', JSON.stringify(new URL("../web/tree-core.mjs", import.meta.url).href)).replace('new URL("./nox-trees.css", import.meta.url).href', '"test.css"');
    await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
    await extension.setup();
    const flush = () => new Promise(resolve => setImmediate(resolve));
    await api.queuePrompt(0,current); await flush();
    current = prompt("workflow-a",2); await api.queuePrompt(0,current); await flush();
    let a = [...files.values()].find(t => t.workflowId === "workflow-a");
    assert.equal(a.nodes.length,2); assert.equal(groupedVersions(a.nodes).length,1);
    assert.equal(a.nodes[0].prompt[1].inputs.seed,1); assert.equal(a.nodes[1].prompt[1].inputs.seed,2);
    current = prompt("workflow-b",3); await api.queuePrompt(0,current); await flush();
    const b = [...files.values()].find(t => t.workflowId === "workflow-b");
    assert.equal(b.nodes.length,1); assert.equal(b.nodes[0].parent,null);
    current = prompt("workflow-a",4,"night"); await api.queuePrompt(0,current); await flush();
    a = [...files.values()].find(t => t.workflowId === "workflow-a");
    assert.equal(a.nodes.length,3); assert.equal(groupedVersions(a.nodes).length,2);
    assert.equal(a.nodes[2].parent,a.nodes[1].id);
    // Open the latest version's controls and explicitly continue from it.
    const toggle = elements.findLast(e => e.attrs["aria-label"]?.startsWith("Show preview and controls"));
    await toggle.onclick();
    const continuing = elements.findLast(e => e.textContent === "Continue from here").onclick();
    await flush();
    await elements.findLast(e => e.textContent === "Keep seed fixed").onclick();
    await continuing;
    await api.queuePrompt(0,current); await flush();
    a = [...files.values()].find(t => t.workflowId === "workflow-a");
    assert.equal(a.nodes.at(-1).branchStart,true);
    assert.equal(a.nodes.at(-1).groupId,undefined);
    assert.equal(groupedVersions(a.nodes).length,3);
    assert.equal([...files.values()].find(t => t.workflowId === "workflow-b").nodes.length,1);
  } finally {
    for (const [key,value] of Object.entries(originals)) value === undefined ? delete globalThis[key] : globalThis[key] = value;
  }
});
