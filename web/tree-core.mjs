export const copy = (value) => JSON.parse(JSON.stringify(value));

export function configurationKey(prompt) {
  const normalize = (value) => {
    if (Array.isArray(value)) return value.map(normalize);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(Object.keys(value).sort().filter(key => key !== "_meta").map(key =>
      [key, /^(seed|noise_seed)$/.test(key) && typeof value[key] === "number" ? "<seed>" : normalize(value[key])]));
  };
  return JSON.stringify(normalize(prompt));
}

export function changedText(before, after) {
  let start = 0, end = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start++;
  while (end < before.length - start && end < after.length - start && before[before.length - end - 1] === after[after.length - end - 1]) end++;
  return { prefix: before.slice(0, start), removed: before.slice(start, before.length - end), added: after.slice(start, after.length - end), suffix: end ? before.slice(-end) : "" };
}

export function groupedVersions(nodes) {
  const groups = new Map(), ids = new Map();
  for (const node of nodes) {
    const key = node.groupId || node.id;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(node); ids.set(node.id, key);
  }
  return [...groups.entries()].map(([id, runs]) => ({ ...runs[0], id, parent: ids.get(runs[0].parent) || null, runs }));
}

export function branchLanes(nodes) {
  const lanes = new Map(), firstChild = new Set();
  let count = 0;
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const resumed = node.branchStart || (node.parent && node.parent !== nodes[i - 1]?.id);
    if (node.parent && lanes.has(node.parent) && !firstChild.has(node.parent) && !resumed) {
      lanes.set(node.id, lanes.get(node.parent));
    } else lanes.set(node.id, count++);
    if (node.parent) firstChild.add(node.parent);
  }
  return { lanes, count };
}

export function newTree(name = "My tree") {
  return { schema: 1, id: crypto.randomUUID(), name, created: Date.now(), active: null, seedChoice: "ask", nodes: [] };
}

export function differences(before = {}, after = {}) {
  const changes = [];
  for (const id of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const a = before[id], b = after[id];
    const title = b?._meta?.title || a?._meta?.title || b?.class_type || a?.class_type || id;
    if (!a || !b || a.class_type !== b.class_type) {
      changes.push(`${title} #${id}: ${!a ? "added" : !b ? "removed" : "replaced"}`);
      continue;
    }
    for (const key of new Set([...Object.keys(a.inputs), ...Object.keys(b.inputs)])) {
      const old = a.inputs[key], value = b.inputs[key];
      if (JSON.stringify(old) === JSON.stringify(value)) continue;
      const short = (v) => { const s = JSON.stringify(v) ?? "—"; return s.length > 100 ? s.slice(0, 100) + "…" : s; };
      changes.push(`${title} #${id} · ${key}: ${short(old)} → ${short(value)}`);
    }
  }
  return changes;
}

export function seeds(prompt) {
  return Object.entries(prompt).flatMap(([id, node]) => Object.entries(node.inputs || {})
    .filter(([key, value]) => /^(seed|noise_seed)$/.test(key) && typeof value === "number")
    .map(([key, value]) => ({ id, key, value })));
}

export function restoreSeeds(graph, prompt, fixed) {
  let restored = 0;
  const missing = [];
  for (const seed of seeds(prompt)) {
    const node = graph.getNodeById(seed.id);
    const widget = node?.widgets?.find(w => w.name === seed.key);
    if (!widget) { missing.push(seed); continue; }
    if (fixed) widget.value = seed.value;
    else {
      const bytes = crypto.getRandomValues(new Uint32Array(2));
      const maximum = Math.min(Number.MAX_SAFE_INTEGER, widget.options?.max ?? Number.MAX_SAFE_INTEGER);
      widget.value = (bytes[0] * 2097152 + (bytes[1] >>> 11)) % (maximum + 1);
    }
    const control = node.widgets.find(w => w.name === "control_after_generate" || w.name === `${seed.key}_control_after_generate`);
    if (control) control.value = fixed ? "fixed" : "randomize";
    restored++;
  }
  graph.setDirtyCanvas?.(true, true);
  return { restored, missing };
}

export function validateTree(tree) {
  if (tree?.schema !== 1 || typeof tree.name !== "string" || !Array.isArray(tree.nodes)) throw Error("Invalid tree file.");
  const seen = new Set();
  for (const node of tree.nodes) {
    if (node.groupId && node.groupId !== node.id && !seen.has(node.groupId)) throw Error("Invalid result group.");
    if (typeof node.id !== "string" || seen.has(node.id) || (node.parent && !seen.has(node.parent)) || !Array.isArray(node.workflow?.nodes) || !node.prompt || !Array.isArray(node.images)) throw Error("The tree contains invalid versions.");
    seen.add(node.id);
    for (const image of node.images) {
      if (image.preview && !/^data:image\/(jpeg|png|webp);base64,/.test(image.preview)) throw Error("Invalid preview.");
    }
  }
  if (tree.active && !seen.has(tree.active)) throw Error("Invalid active version.");
  return tree;
}
