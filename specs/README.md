# Specs

Behavioral specifications for audio2sheets. Each spec file covers one component or module.

## Format

- Each spec file is named after the component: `pipeline.md`, `midi-playback.md`, etc.
- Each behavior is a `### [Behavior name]` section with Given/When/Then
- Specs describe **intended behavior from the user's perspective**
- Specs never reference implementation details (private methods, internal variable names)

## Rules

1. **Specs describe what SHOULD happen**, not what the code currently does
2. A human reviews every spec before tests are generated
3. Tests are generated from specs using `/test-spec`, never from reading source code
4. One test per spec behavior

## Workflow

1. `/write-spec <source-file>` — scaffold a spec from the public API
2. Human reviews and edits the spec
3. `/test-spec <spec-file>` — generate tests from the approved spec
4. `/test-validate` — check coverage and quality
