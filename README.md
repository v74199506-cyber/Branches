#  Branches

Branchable generation history for [ComfyUI](https://github.com/comfyanonymous/ComfyUI).

Branches records image-generation experiments in a visual, persistent history. Each generation keeps its workflow, submitted parameters, seed, status, and available previews so you can return to a successful result and explore another path without losing earlier work.

## Highlights

- Visual version tree with explicit branches.
- Separate history for different workflows.
- Consecutive runs with the same configuration grouped into one version while every result remains selectable.
- Per-result workflow, seed, status, and preview retention.
- **Continue from here** to restore a result and create a new branch.
- Seed choice when continuing: keep the original seed or generate a new one.
- Side-by-side result comparison with parameter and prompt differences.
- Full prompt diff for changed text fields.
- Rename, favorite, expand, and collapse versions.
- Save and restore trees through ComfyUI user-data storage.
- JSON export and import for backups or moving a history to another instance.
- Vertical right-sidebar layout or horizontal bottom-panel layout.
- Theme-aware styling that follows ComfyUI colors.
- Local-only operation with no analytics, telemetry, uploads, or external services.

## Installation

1. Copy this repository into `ComfyUI/custom_nodes/generation-trees/`.
2. Restart ComfyUI.
3. Refresh the browser page.
4. Open the **Versions** tab in the Workflow Overview panel.

The extension has no additional Python or JavaScript dependencies.

## Usage

Run a workflow normally. An accepted generation creates a history result. The configuration is captured at queue time, before randomized widgets can change, and completed outputs are associated with that result.

Select **Continue from here** on any result to restore its workflow. If the prompt, LoRA, or another parameter is changed before the next run, the new result appears as a child version. Returning to an earlier result and running again creates a sibling branch. Repeated runs with the same non-seed configuration are grouped under one version; use the result selector to inspect or continue from a specific seed.

Use the gear button to choose the layout. In vertical mode, the tree lives in the right sidebar. In horizontal mode, it appears along the bottom of the canvas. The **Close** control hides the panel without changing the workflow.

Use **Save tree** for an explicit save. Trees are also saved automatically after relevant changes. **Open**, **Export**, and **Import** provide recovery and portability options.

## Seed behavior

When continuing from a result, Branches shows the seed actually submitted for that generation. You can keep it fixed for controlled prompt or LoRA comparisons, or choose a new random seed for exploration. The preference can be remembered per tree and reset through **Seed preference**.

Automatic restoration supports numeric `seed` and `noise_seed` widgets and their standard `control_after_generate` controls. Custom nodes with private seed controls, connected seed inputs, or unsupported subgraphs may require manual adjustment; the panel reports seeds it could not restore.

## Storage and privacy

Tree files are stored through ComfyUI's local user-data mechanism. The extension does not send workflow data, prompts, images, telemetry, or identifiers to a remote service. Exported JSON files may contain prompts, model names, local filenames, and embedded preview thumbnails; handle exported files accordingly.

## Current limitations

- Preview thumbnails are generated for image outputs and stored at reduced size. Original output files remain managed by ComfyUI.
- Video and non-image outputs do not receive embedded previews in this release.
- Existing histories are preserved, but grouping applies to generations captured after this version is installed.
- Use one active browser tab per tree when generating to avoid concurrent edits to the same JSON file.
- Pending jobs can be reconciled after a page reload while their records remain available in ComfyUI history.

## Development and verification

```text
node --test tests/core.test.mjs tests/integration.test.mjs
```

The tests cover seed capture and restoration, version diffs, branch geometry, grouped results, workflow isolation, prompt comparison, persistence validation, and queue integration.

## License

No license has been declared yet. Add a license file before distributing or accepting external contributions.

## Release

This repository contains the initial public release of Branches. Feature behavior may evolve as ComfyUI's frontend APIs change.
