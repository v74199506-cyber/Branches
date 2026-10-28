# Article guide for Eva — Branches

## Suggested title

**Branches: a visual creative history for ComfyUI**

## Article angle

Explain Branches as a tool for exploring image-generation ideas without losing
previous results. The central metaphor is a creative tree: each meaningful
direction becomes a version, while small prompt wording experiments remain
grouped as attempts inside that version.

## Points to cover

1. The problem: ComfyUI makes experimentation powerful, but successful prompts,
   seeds, LoRA weights, and workflows are easy to lose among repeated runs.
2. The solution: Branches records the submitted workflow, parameters, seed,
   status, and previews in a persistent local history.
3. Branching: continuing from an older result creates a new path, preserving the
   original path for comparison.
4. Prompt attempts: small wording changes are grouped together; changes such
   as pose, camera angle, clothing, or composition become a new creative version.
5. Reproducibility: users can keep a seed fixed when comparing prompt or LoRA
   changes, or randomize it for exploration.
6. Interface: the tree can appear in the right sidebar or as a horizontal
   bottom panel, following ComfyUI's dark visual language.
7. Privacy: data stays in ComfyUI's local user-data storage; no analytics or
   external upload service is required.
8. Portability: trees can be saved, exported, and imported as JSON snapshots.
9. Practical example: start with a character portrait, try several prompt
   phrasings, then branch into a new pose while keeping the earlier results.

## Recommended structure

- Opening problem and one-sentence explanation of Branches.
- Walkthrough with screenshots: tree, continue action, fixed-seed dialog,
  comparison, and horizontal layout.
- Short explanation of versions versus prompt attempts.
- Installation and privacy note.
- Closing paragraph focused on creative iteration and reproducibility.

## Claims to avoid

- Do not describe Branches as an official ComfyUI feature.
- Do not promise that every custom node seed can be restored automatically.
- Do not include local paths, private contact details, machine names, or test
  data in screenshots.

## Links

- Repository: https://github.com/v74199506-cyber/Branches
- ComfyUI: https://github.com/comfyanonymous/ComfyUI
