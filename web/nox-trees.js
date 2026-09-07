import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { copy, newTree, differences, seeds, restoreSeeds, validateTree, branchLanes, configurationKey, groupedVersions, changedText } from "./tree-core.mjs";

const DIR = "nox-trees";
const path = (tree) => `${DIR}/${tree.id}.json`;
let tree, panel, list, title, status, footer, ready;
let parentCursor = null;
let branchOrigin = null;
let historyObserver;
let orientation = "vertical";
let saveChain = Promise.resolve(), selected = new Set(), expandedVersions = new Set();
const pending = new Map();
const resultSelections = new Map();
const workflowTrees = new Map();
let workflowSwitch = Promise.resolve();
let restoring = false;
async function selectWorkflow(workflow) {
  const key = workflow?.id;
  if (!key) return;
  if (tree.workflowId === key || tree.workflowIds?.includes(key)) return;
  if (!tree.workflowId && (!tree.nodes.length || tree.nodes.some(n => n.workflow.id === key))) {
    tree.workflowId = key; workflowTrees.set(key, tree); return;
  }
  if (tree.workflowId) workflowTrees.set(tree.workflowId, tree);
  const existing = workflowTrees.get(key);
  if (existing) tree = existing;
  else {
    const files = await api.listUserDataFullInfo(DIR);
    let found;
    for (const file of files.filter(f => f.path.endsWith(".json"))) {
      const response = await api.getUserData(`${DIR}/${file.path}`);
      if (!response.ok) continue;
      let candidate;
      try { candidate = validateTree(await response.json()); } catch { continue; }
      if (candidate.workflowId === key || candidate.workflowIds?.includes(key)) { found = candidate; break; }
    }
    tree = found || { ...newTree(), workflowId: key };
    workflowTrees.set(key, tree);
  }
  parentCursor = tree.active; branchOrigin = null;
  localStorage.setItem("nox-trees-last", tree.id);
  render(); await reconcile();
}
const el = (tag, text, cls) => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (cls) node.className = cls;
  return node;
};
function message(text, error = false) {
  status.textContent = text;
  status.classList.toggle("nox-error", error);
}
function button(text, fn, primary = false) {
  const b = el("button", text, primary ? "nox-primary" : "");
  b.type = "button";
  b.onclick = async () => {
    b.disabled = true;
    try { await fn(); } catch (error) { console.error("Nox Trees", error); message(error.message, true); }
    finally { b.disabled = false; }
  };
  return b;
}
function save(target = tree) {
  const snapshot = copy(target);
  message("Saving…");
  const operation = saveChain.catch(() => {}).then(async () => {
    await api.storeUserData(path(snapshot), snapshot);
    if (target === tree) message(`Saved to computer · ${new Date().toLocaleTimeString()}`);
  });
  saveChain = operation;
  operation.catch(error => message(`Could not save: ${error.message}. Use Export to keep a copy.`, true));
  return operation;
}
function modal(heading) {
  const dialog = el("dialog", undefined, "nox-dialog");
  dialog.append(el("h2", heading));
  document.body.append(dialog);
  dialog.addEventListener("close", () => dialog.remove());
  dialog.showModal();
  return dialog;
}
function imageURL(image) {
  return api.apiURL(`/view?${new URLSearchParams({ filename: image.filename, subfolder: image.subfolder || "", type: image.type || "output" })}`);
}
async function thumbnail(image) {
  const response = await api.fetchApi(`/view?${new URLSearchParams({ filename: image.filename, subfolder: image.subfolder || "", type: image.type || "output" })}`);
  if (!response.ok) throw Error("Preview unavailable");
  const bitmap = await createImageBitmap(await response.blob());
  const canvas = document.createElement("canvas");
  const ratio = Math.min(1, 360 / Math.max(bitmap.width, bitmap.height));
  canvas.width = Math.max(1, Math.round(bitmap.width * ratio)); canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.8);
}
function showImage(image) {
  const dialog = modal("Result");
  const img = el("img"); img.src = imageURL(image); img.alt = "Generation result";
  img.onerror = () => { img.onerror = null; if (image.preview) img.src = image.preview; };
  dialog.append(img, button("Close", () => dialog.close()));
}
async function seedChoice(node) {
  if (!seeds(node.prompt).length) return "original";
  if (["fixed", "randomize"].includes(tree.seedChoice)) return tree.seedChoice;
  return new Promise(resolve => {
    const dialog = modal("Continue with the same seed?");
    dialog.append(el("p", "Keeping the seed fixed helps compare prompt and LoRA strength changes. The image may still change significantly."));
    dialog.append(el("pre", seeds(node.prompt).map(s => `Node ${s.id} · ${s.key}: ${s.value}`).join("\n")));
    const label = el("label"), remember = el("input"); remember.type = "checkbox";
    label.append(remember, el("span", "Remember my choice for this tree")); dialog.append(label);
    const actions = el("div", undefined, "nox-toolbar");
    for (const [text, value] of [["Cancel", null], ["Use random seed", "randomize"], ["Keep seed fixed", "fixed"]]) {
      actions.append(button(text, () => {
        if (remember.checked && value) tree.seedChoice = value;
        resolve(value); dialog.close();
      }, value === "fixed"));
    }
    dialog.append(actions); dialog.addEventListener("cancel", () => resolve(null));
  });
}
async function continueFrom(node) {
  const choice = await seedChoice(node);
  if (!choice) return;
  // Keep the current canvas recoverable before replacing it with the selected version.
  const draft = await app.graphToPrompt();
  tree.draft = { workflow: copy(draft.workflow), prompt: copy(draft.output) };
  await save();
  restoring = true;
  try { await app.loadGraphData(copy(node.workflow)); } finally { restoring = false; }
  const loaded = await app.graphToPrompt();
  if (loaded.workflow.id) {
    tree.workflowIds = [...new Set([...(tree.workflowIds || []), ...(tree.workflowId ? [tree.workflowId] : []), loaded.workflow.id])];
    tree.workflowId ||= loaded.workflow.id;
    workflowTrees.set(loaded.workflow.id, tree);
  }
  const result = restoreSeeds(app.rootGraph || app.graph, node.prompt, choice === "fixed");
  tree.active = node.id;
  parentCursor = node.id;
  branchOrigin = { treeId: tree.id, parent: node.id };
  tree.seedMode = choice;
  render(); await save();
  if (result.missing.length) message(`Warning: ${result.missing.length} internal node seed(s) could not be restored. Check these nodes before generating.`, true);
}
function render() {
  title.value = tree.name;
  historyObserver?.disconnect();
  list.replaceChildren();
  footer.textContent = `${tree.nodes.length} versions · ${parentCursor ? (tree.seedMode === "fixed" ? "🔒 Seed fixed on restore" : tree.seedMode === "randomize" ? "🎲 Seed randomized on restore" : "Seed follows workflow") : "Next generation: new root. Use Continue from here to branch."}`;
  if (!tree.nodes.length) {
    list.append(el("div", "Your tree starts with the next generation. Return to a version and choose “Continue from here” to explore another branch.", "nox-empty"));
    return;
  }
  const versions = groupedVersions(tree.nodes);
  footer.textContent = `${versions.length} versions · ${tree.nodes.length} results · ${parentCursor ? "Continue from a result to branch" : "Next generation starts a new root"}`;
  const { lanes, count: nextLane } = branchLanes(versions);
  const rows = new Map();
  const history = el("div", undefined, "nox-history");
  const graphWidth = Math.max(44, nextLane * 16 + 20);
  history.style.setProperty("--nox-graph-width", `${graphWidth}px`);
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.classList.add("nox-graph"); svg.setAttribute("aria-hidden", "true");
  history.append(svg); list.append(history);
  for (const version of orientation === "horizontal" ? versions : [...versions].reverse()) {
      const node = version.runs.find(run => run.id === resultSelections.get(version.id)) || version.runs.at(-1);
      const isCurrent = version.runs.some(run => run.id === parentCursor);
      const card = el("article", undefined, `nox-card${isCurrent ? " nox-active" : ""}`);
      const heading = el("div", undefined, "nox-node-heading");
      const expanded = expandedVersions.has(node.id);
      const togglePreview = button("", () => { expanded ? expandedVersions.delete(node.id) : expandedVersions.add(node.id); render(); });
      togglePreview.className = "nox-preview-dot";
      togglePreview.setAttribute("aria-label", `${expanded ? "Hide" : "Show"} preview and controls for ${node.name}`);
      togglePreview.setAttribute("aria-expanded", String(expanded));
      togglePreview.title = "Toggle preview and controls";
      const nameHeading = el("h3", `${node.favorite ? "★ " : ""}${version.name}${isCurrent ? " ← current" : ""}`);
      nameHeading.title = "Double-click to rename";
      nameHeading.ondblclick = () => inlineRename(node, heading);
      heading.append(togglePreview, nameHeading);
      card.append(heading);
      if (version.runs.length > 1) {
        const picker = el("select"); picker.setAttribute("aria-label", `Result for ${version.name}`);
        for (const [index, run] of version.runs.entries()) {
          const option = el("option", `Result ${index + 1} · ${run.status} · ${seeds(run.prompt).map(s => s.value).join(", ") || "No seed"}`);
          option.value = run.id; option.selected = run.id === node.id; picker.append(option);
        }
        picker.onchange = () => { resultSelections.set(version.id, picker.value); expandedVersions.add(picker.value); render(); };
        card.append(picker);
      }
      const labels = { queued: "Queued", running: "Generating", complete: "Completed", error: "Failed", interrupted: "Interrupted", unknown: "No server history" };
      card.append(el("div", `${new Date(node.created).toLocaleString()} · ${labels[node.status] || node.status}`, "nox-meta"));
      if (node.previewWarning) card.append(el("div", "Preview could not be embedded; keep the original image file.", "nox-meta"));
      if (expanded && node.images.length) {
        const images = el("div", undefined, "nox-images");
        for (const image of node.images) {
          const img = el("img"); img.src = image.preview || imageURL(image); img.loading = "lazy"; img.alt = `Preview of ${node.name}`;
          img.tabIndex = 0; img.onclick = () => showImage(image); img.onkeydown = e => { if (e.key === "Enter") showImage(image); }; images.append(img);
        }
        card.append(images);
      }
      const changes = differences(tree.nodes.find(n => n.id === node.parent)?.prompt, node.prompt);
      const details = el("details"); details.append(el("summary", changes.length ? `Show changes… (${changes.length})` : "No changes"));
      for (const change of changes) details.append(el("p", change));
      details.append(el("p", seeds(node.prompt).map(s => `${s.key} #${s.id}: ${s.value}`).join("\n") || "No numeric seed found"));
      card.append(details);
      if (expanded) {
      const actions = el("div", undefined, "nox-toolbar");
      actions.append(button("Continue from here", () => continueFrom(node), true));
      actions.append(button(node.favorite ? "★" : "☆", async () => { node.favorite = !node.favorite; render(); await save(); }));
      actions.append(button("Rename", () => renameNode(node)));
      actions.append(button(selected.has(node.id) ? "✓ Compare" : "Compare", () => {
        if (selected.has(node.id)) selected.delete(node.id); else selected.add(node.id);
        if (selected.size === 2) { compare([...selected].map(id => tree.nodes.find(n => n.id === id))); selected.clear(); }
        render();
      }));
      card.append(actions);
      }
      history.append(card); rows.set(version.id, card);
    }
  const draw = () => {
    const horizontal = orientation === "horizontal";
    svg.replaceChildren(); svg.setAttribute("width", horizontal ? history.scrollWidth : graphWidth); svg.setAttribute("height", horizontal ? graphWidth : history.scrollHeight);
    const colors = ["#91b6d4", "#b5a0cf", "#a6bd98", "#c8b780", "#b89696"];
    const x = id => horizontal ? rows.get(id).offsetLeft + 20 : 14 + lanes.get(id) * 16;
    const y = id => horizontal ? 14 + lanes.get(id) * 16 : rows.get(id).offsetTop + 20;
    const shape = (tag, attributes) => {
      const item = document.createElementNS(svg.namespaceURI, tag);
      for (const [key, value] of Object.entries(attributes)) item.setAttribute(key, value);
      svg.append(item);
    };
    for (const node of versions) {
      if (!rows.has(node.parent)) continue;
      const from = y(node.parent), to = y(node.id), start = x(node.parent), end = x(node.id);
      const d = horizontal
        ? `M ${start} ${from} C ${start + 24} ${from}, ${start + 24} ${to}, ${Math.min(end, start + 40)} ${to} L ${end} ${to}`
        : `M ${start} ${from} C ${end} ${from - 24}, ${end} ${from - 24}, ${end} ${Math.max(to, from - 40)} L ${end} ${to}`;
      shape("path", { d, fill: "none", stroke: colors[lanes.get(node.id) % colors.length], "stroke-width": 1.6 });
    }
    for (const node of versions) shape("circle", { cx: x(node.id), cy: y(node.id), r: node.runs.some(run => run.id === parentCursor) ? 5 : 3.5, fill: colors[lanes.get(node.id) % colors.length], stroke: colors[lanes.get(node.id) % colors.length], "stroke-width": 1.6 });
  };
  historyObserver = new ResizeObserver(draw);
  for (const row of rows.values()) historyObserver.observe(row);
  requestAnimationFrame(draw);
}
function renameNode(node) {
  const dialog = modal("Version name"), input = el("input"); input.value = node.name; input.setAttribute("aria-label", "Version name");
  dialog.append(input, button("Save name", async () => {
    const name = input.value.trim() || node.name;
    for (const run of tree.nodes.filter(n => (n.groupId || n.id) === (node.groupId || node.id))) run.name = name;
    render(); await save(); dialog.close();
  }));
}
function inlineRename(node, heading) {
  if (heading.querySelector("input")) return;
  const original = heading.querySelector("h3");
  if (!original) return;
  const input = el("input", undefined, "nox-inline-name");
  input.value = node.name; input.setAttribute("aria-label", "Version name");
  original.replaceWith(input); input.focus(); input.select();
  let finished = false;
  const finish = saveIt => {
    if (finished) return; finished = true;
    if (saveIt && input.value.trim()) {
      for (const run of tree.nodes.filter(n => (n.groupId || n.id) === (node.groupId || node.id))) run.name = input.value.trim();
    }
    render(); if (saveIt) void save().catch(() => {});
  };
  input.addEventListener("keydown", event => {
    if (event.key === "Enter") { event.preventDefault(); finish(true); }
    if (event.key === "Escape") { event.preventDefault(); finish(false); }
  });
  input.addEventListener("blur", () => finish(true), { once: true });
}
function compare(nodes) {
  const dialog = modal("Compare versions"), row = el("div"); row.style.cssText = "display:flex;gap:16px";
  for (const node of nodes) {
    const column = el("div"); column.style.cssText = "width:50%;min-width:0"; column.append(el("h3", node.name));
    if (node.images[0]) { const img = el("img"); img.src = node.images[0].preview || imageURL(node.images[0]); img.alt = node.name; column.append(img); }
    row.append(column);
  }
  dialog.append(row, el("pre", differences(nodes[0].prompt, nodes[1].prompt).join("\n") || "Same submitted configuration."));
  for (const id of new Set([...Object.keys(nodes[0].prompt), ...Object.keys(nodes[1].prompt)])) {
    const a = nodes[0].prompt[id]?.inputs || {}, b = nodes[1].prompt[id]?.inputs || {};
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (a[key] === b[key] || !(typeof a[key] === "string" || typeof b[key] === "string")) continue;
      const diff = changedText(String(a[key] ?? ""), String(b[key] ?? ""));
      dialog.append(el("h3", `Node ${id} · ${key}`));
      const pair = el("div", undefined, "nox-text-diff");
      for (const [label, changed, tag] of [["Before", diff.removed, "del"], ["After", diff.added, "ins"]]) {
        const column = el("div"), pre = el("pre");
        pre.append(document.createTextNode(diff.prefix), el(tag, changed), document.createTextNode(diff.suffix));
        column.append(el("strong", label), pre); pair.append(column);
      }
      dialog.append(pair);
    }
  }
  dialog.append(button("Close", () => dialog.close()));
}
async function openTree() {
  await save();
  const files = await api.listUserDataFullInfo(DIR);
  const dialog = modal("Open saved tree");
  for (const file of files.filter(f => f.path.endsWith(".json"))) {
    const response = await api.getUserData(`${DIR}/${file.path}`);
    if (!response.ok) continue;
    let saved;
    try { saved = validateTree(await response.json()); } catch { continue; }
    dialog.append(button(`${saved.name} · ${saved.nodes.length} versions`, async () => {
      tree = saved; tree.id = file.path.slice(0, -5); parentCursor = null; selected.clear(); expandedVersions.clear(); render(); dialog.close();
      localStorage.setItem("nox-trees-last", tree.id); await reconcile();
    }));
  }
  dialog.append(button("Close", () => dialog.close()));
}
async function addImages(target, node, outputs) {
  for (const output of Object.values(outputs || {})) {
    for (const source of output?.images || []) {
      if (!source.filename || node.images.some(i => i.filename === source.filename && i.subfolder === (source.subfolder || "") && i.type === (source.type || "output"))) continue;
      const image = { filename: source.filename, subfolder: source.subfolder || "", type: source.type || "output" };
      node.images.push(image);
      try { image.preview = await thumbnail(image); } catch { node.previewWarning = true; }
    }
  }
  if (target === tree) render();
  await save(target);
}
async function refresh(target, node) {
  const response = await api.fetchApi(`/history/${encodeURIComponent(node.promptId)}`);
  if (!response.ok) throw Error("Could not retrieve history.");
  const history = (await response.json())[node.promptId];
  if (!history) return false;
  if (history.prompt?.[2]) {
    node.prompt = copy(history.prompt[2]);
    node.changes = differences(target.nodes.find(n => n.id === node.parent)?.prompt, node.prompt);
  }
  node.status = history.status?.status_str === "error" ? "error" : "complete";
  await addImages(target, node, history.outputs);
  pending.delete(node.promptId);
  return true;
}
async function reconcile() {
  const response = await api.fetchApi("/queue");
  if (!response.ok) return;
  const queue = await response.json();
  const ids = new Set([...(queue.queue_running || []), ...(queue.queue_pending || [])].map(item => item[1]));
  for (const node of tree.nodes.filter(n => ["queued", "running"].includes(n.status))) {
    pending.set(node.promptId, { target: tree, node });
    if (await refresh(tree, node)) continue;
    if (!ids.has(node.promptId)) { node.status = "unknown"; pending.delete(node.promptId); }
  }
  render();
}

app.registerExtension({
  name: "Nox.GenerationTrees",
  afterConfigureGraph() {
    if (restoring || !ready) return;
    void ready.then(async () => {
      const snapshot = await app.graphToPrompt();
      workflowSwitch = workflowSwitch.catch(() => {}).then(() => selectWorkflow(snapshot.workflow));
      await workflowSwitch;
    }).catch(error => message(error.message, true));
  },
  async setup() {
    orientation = localStorage.getItem("nox-trees-orientation") === "horizontal" ? "horizontal" : "vertical";
    const css = el("link"); css.rel = "stylesheet"; css.href = new URL("./nox-trees.css", import.meta.url).href; document.head.append(css);
    panel = el("aside", undefined, "nox-panel"); panel.setAttribute("aria-label", "Version tree"); panel.hidden = true;
    let nativePanel;
    const setPanelOpen = (open) => {
      panel.hidden = !open;
      nativePanel?.classList.toggle("nox-show-versions", open && orientation === "vertical");
      bottomLauncher.hidden = orientation !== "horizontal" || open;
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-selected", String(open));
      if (!open) toggle.focus();
    };
    panel.id = "nox-version-panel";
    const toggle = button("Versions", () => setPanelOpen(!panel.hidden ? false : true)); toggle.className = "nox-tab";
    const bottomLauncher = button("Versions & history", () => setPanelOpen(true));
    bottomLauncher.className = "nox-bottom-launcher";
    bottomLauncher.hidden = orientation !== "horizontal";
    document.body.append(bottomLauncher);
    toggle.setAttribute("role", "tab");
    toggle.setAttribute("aria-controls", panel.id);
    toggle.setAttribute("aria-expanded", "false");
    const header = el("div", undefined, "nox-header");
    const heading = el("div", undefined, "nox-heading");
    const close = button("× Close", () => {
      setPanelOpen(false);
      if (orientation === "vertical") nativePanel?.querySelector('[aria-label="Toggle properties panel"]')?.click();
    });
    close.setAttribute("aria-label", "Close versions panel");
    const settings = button("⚙", () => {
      const dialog = modal("History settings");
      const label = el("label", "Tree layout");
      const select = el("select"); select.setAttribute("aria-label", "Tree layout");
      for (const [value, text] of [["vertical", "Vertical — right sidebar"], ["horizontal", "Horizontal — bottom panel"]]) {
        const option = el("option", text); option.value = value; option.selected = value === orientation; select.append(option);
      }
      label.append(select); dialog.append(label);
      dialog.append(button("Apply", () => {
        orientation = select.value;
        localStorage.setItem("nox-trees-orientation", orientation);
        attachPanel(); setPanelOpen(true); render(); dialog.close();
      }, true), button("Cancel", () => dialog.close()));
    });
    settings.setAttribute("aria-label", "History settings"); settings.title = "History settings";
    heading.append(el("h2", "Versions and history"), settings, close);
    header.append(heading);
    title = el("input", undefined, "nox-name"); title.setAttribute("aria-label", "Tree name");
    title.onchange = () => { tree.name = title.value.trim() || "My tree"; void save().catch(() => {}); };
    header.append(title);
    const toolbar = el("div", undefined, "nox-toolbar");
    toolbar.append(button("New", async () => { await save(); tree = newTree(); parentCursor = null; selected.clear(); render(); await save(); localStorage.setItem("nox-trees-last", tree.id); }));
    toolbar.append(button("Open", openTree), button("Save tree", () => save(), true));
    toolbar.append(button("Export", () => {
      const url = URL.createObjectURL(new Blob([JSON.stringify(tree)], { type: "application/json" }));
      const a = el("a"); a.href = url; a.download = `${tree.name.replace(/[^\p{L}\p{N} _-]/gu, "_")}.nox-tree.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    }));
    const importer = el("input"); importer.type = "file"; importer.accept = ".json"; importer.hidden = true;
    importer.onchange = async () => {
      try {
        const file = importer.files[0]; if (!file) return;
        const imported = validateTree(JSON.parse(await file.text()));
        await save(); imported.id = crypto.randomUUID(); tree = imported; parentCursor = null; await save(); localStorage.setItem("nox-trees-last", tree.id); render();
      } catch (error) { message(error.message, true); } finally { importer.value = ""; }
    };
    toolbar.append(button("Import", () => importer.click()), importer);
    toolbar.append(button("Seed preference", async () => { tree.seedChoice = "ask"; await save(); message("You will be asked about the seed when continuing from a version."); }));
    toolbar.append(button("Recover previous edit", async () => {
      if (!tree.draft) { message("No previous edit saved in this tree."); return; }
      await app.loadGraphData(copy(tree.draft.workflow)); parentCursor = null; render(); message("Previous edit restored. The next generation starts a new root.");
    }));
    header.append(toolbar);
    const options = el("details", undefined, "nox-options");
    options.append(el("summary", "Tree options"));
    const extraActions = el("div", undefined, "nox-toolbar");
    for (const action of [...toolbar.children].slice(3)) extraActions.append(action);
    options.append(extraActions); header.append(options);
    status = el("div", "Loading…", "nox-status"); status.setAttribute("role", "status"); header.append(status);
    list = el("div", undefined, "nox-list"); footer = el("div", undefined, "nox-footer"); panel.append(header, list, footer);
    const attachPanel = () => {
      panel.classList.toggle("nox-horizontal", orientation === "horizontal");
      if (orientation === "horizontal" && panel.parentElement !== document.body) document.body.append(panel);
      const parameters = document.querySelector('#tab-parameters');
      const host = parameters?.closest('[data-testid="properties-panel"]');
      const tabs = parameters?.closest('[role="tablist"]');
      if (!host || !tabs) return;
      if (nativePanel !== host) {
        nativePanel?.classList.remove("nox-show-versions");
        nativePanel = host;
        host.classList.toggle("nox-show-versions", !panel.hidden && orientation === "vertical");
        tabs.addEventListener("click", event => {
          if (orientation === "vertical" && event.target.closest('[role="tab"]') !== toggle) setPanelOpen(false);
        });
      }
      if (tabs.firstElementChild !== toggle) tabs.prepend(toggle);
      host.classList.toggle("nox-show-versions", !panel.hidden && orientation === "vertical");
      if (orientation === "vertical" && panel.parentElement !== host) host.append(panel);
    };
    const dockObserver = new MutationObserver(attachPanel);
    dockObserver.observe(document.body, { childList: true, subtree: true });
    attachPanel();
    ready = (async () => {
      const last = localStorage.getItem("nox-trees-last");
      if (last && /^[\da-f-]+$/i.test(last)) {
        const response = await api.getUserData(`${DIR}/${last}.json`);
        if (response.ok) tree = validateTree(await response.json());
        else if (response.status !== 404) throw Error("Could not open the last tree.");
      }
      tree ||= newTree(); render(); message("Ready · each generation creates a version");
      localStorage.setItem("nox-trees-last", tree.id); await reconcile();
    })().catch(error => {
      tree = newTree(); render();
      message(`Could not open the previous tree: ${error.message}. A new tree has been started.`, true);
    });
    let checking = false;
    setInterval(async () => {
      if (checking || !pending.size) return;
      checking = true;
      try {
        for (const { target, node } of [...pending.values()]) await refresh(target, node);
      } catch (error) { message(error.message, true); }
      finally { checking = false; }
    }, 3000);
    const original = api.queuePrompt;
    api.queuePrompt = async function(number, prompt, ...rest) {
      // Capture before the HTTP call and before ComfyUI advances randomized widgets.
      const snapshot = copy(prompt);
      await ready;
      workflowSwitch = workflowSwitch.catch(() => {}).then(() => selectWorkflow(snapshot.workflow));
      await workflowSwitch;
      const target = tree;
      const parent = parentCursor;
      const origin = branchOrigin;
      const node = { id: crypto.randomUUID(), parent, name: `Version ${target.nodes.length + 1}`, created: Date.now(), workflow: snapshot.workflow, prompt: snapshot.output, images: [], status: "queued", changes: differences(target.nodes.find(n => n.id === parent)?.prompt, snapshot.output) };
      const response = await original.call(this, number, prompt, ...rest);
      if (response.prompt_id) {
        node.branchStart = !!parent && origin?.treeId === target.id && origin.parent === parent;
        const previous = target.nodes.find(n => n.id === parent);
        if (!node.branchStart && previous && configurationKey(previous.prompt) === configurationKey(node.prompt)) {
          node.groupId = previous.groupId || previous.id;
          node.name = previous.name;
        } else node.name = `Version ${groupedVersions(target.nodes).length + 1}`;
        if (branchOrigin === origin) branchOrigin = null;
        node.promptId = response.prompt_id; target.nodes.push(node); target.active = node.id;
        if (target === tree && parentCursor === parent) parentCursor = node.id;
        pending.set(node.promptId, { target, node });
        if (target === tree) render();
        // Storage errors must never turn an accepted job into an apparent queue failure.
        void save(target).catch(() => {});
        void refresh(target, node).catch(error => message(error.message, true));
      }
      return response;
    };
    for (const name of ["execution_start", "executed", "execution_success", "execution_error", "execution_interrupted", "executing"]) {
      api.addEventListener(name, event => {
        const data = event.detail || {};
        const entry = pending.get(data.prompt_id);
        if (!entry) return;
        const { target, node } = entry;
        if (name === "execution_start") { node.status = "running"; if (target === tree) render(); }
        if (name === "executed") void addImages(target, node, { output: data.output }).catch(error => message(error.message, true));
        if (["execution_success", "execution_error", "execution_interrupted"].includes(name) || (name === "executing" && data.node === null)) {
          node.status = name === "execution_error" ? "error" : name === "execution_interrupted" ? "interrupted" : "complete";
          if (target === tree) render();
          void save(target).catch(() => {});
          setTimeout(() => void refresh(target, node).catch(error => message(error.message, true)), 400);
        }
      });
    }
  },
});
