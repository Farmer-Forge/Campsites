# How `ralphloop/task.md` is made

`task.md` is generated, so V1's styles land in it verbatim (spec 2, **Design system**):

```bash
python3 -I docs/superpowers/plans/task-md/gen_task.py docs/superpowers/plans/task-md/task.template.md ralphloop/task.md
```

- **`task.template.md`** is the plan's text. Edit this, not `task.md`, then regenerate. Markers:
  - `{{FILE:<path>}}` is the whole file at V1's `v1.0` tag;
  - `{{INLINE:<path>}}` is a component's inline `styles` block;
  - `{{INLINE_NOTHEME:<path>}}` is the same block minus the dropped theme toggle's rules;
  - `{{LICENSE}}` is the PrimeUI license string.
- **`gen_task.py`** reads V1 from `~/projects/PrimeNG` (`git show v1.0:<path>`). It runs on Lisa, where V1 lives. The loop worker never runs it and never reads V1.
- **Regenerating resets every checkbox.** Once the loop has started, edit `task.md` directly, or regenerate and re-tick the finished steps.
