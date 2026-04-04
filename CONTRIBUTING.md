# Contributing to three-yakuza

Thanks for your interest in contributing. This document covers setup, conventions, and how to submit changes.

## Getting started

```bash
git clone https://github.com/tonybolivar/three-yakuza.git
cd three-yakuza
pnpm install
pnpm build
pnpm test:run
```

Requires Node.js >= 20 and pnpm >= 10.

## Project structure

This is a monorepo managed with pnpm workspaces and turborepo.

```
packages/
  gmt-parser/       Pure binary parser for GMT/CMT/IFA files
  gmd-parser/       Pure binary parser for GMD model files
  par-parser/       PAR archive unpacker + SLLZ decompression
  three-gmt/        Three.js loader for GMT animations
  three-gmd/        Three.js loader for GMD models
shared/
  binary-reader/    Internal DataView wrapper used by parsers
examples/
  gmt-viewer/       Browser demo: load PAR/GMD/GMT and render in Three.js
```

Parser packages have zero external dependencies. Three.js packages peer-depend on `three`.

## Development workflow

Build all packages:
```bash
pnpm build
```

Build a specific package:
```bash
pnpm --filter @three-yakuza/gmt-parser build
```

Run all tests:
```bash
pnpm test:run
```

Lint and format:
```bash
pnpm lint
pnpm format:check
```

## Code style

We use ESLint and Prettier. Your code must pass linting before it can be merged.

### Rules

- TypeScript strict mode everywhere.
- Use `const` by default. Only use `let` when reassignment is needed.
- No default exports. Use named exports only.
- Interfaces over type aliases for object shapes.
- No classes for data structures. Plain interfaces/types. Classes only for Loader and Builder patterns.
- All numeric types must be commented with their wire format (e.g. `// uint32`, `// float16`).
- Error messages must include the byte offset where parsing failed.
- No external dependencies in parser packages. They operate on `ArrayBuffer`/`DataView` only.

### Naming

- Files: `kebab-case.ts`
- Types/Interfaces: `PascalCase`
- Functions/variables: `camelCase`
- Enums: `PascalCase` with `UPPER_SNAKE_CASE` members
- Constants: `UPPER_SNAKE_CASE`

### Commit messages

Use conventional commits:

```
feat(gmt-parser): add ROT_QUAT_XYZ_INT decoding
fix(three-gmt): correct quaternion component order
docs: update README usage examples
test(gmt-parser): add synthetic fixture for half-float curves
chore: bump three peer dep to 0.180.0
```

Scope should be the package name without the `@three-yakuza/` prefix.

## Testing

We use vitest. Tests live in `__tests__/` directories next to the source.

```
packages/gmt-parser/
  src/
    reader.ts
  __tests__/
    reader.test.ts
```

### What to test

- **Binary reader utilities:** Known byte sequences in, expected values out.
- **Curve deserialization:** Each GMT curve format needs tests with known inputs. Pay extra attention to scaled quaternions (`int16 / 16384`), packed quaternions (`ROT_QUAT_XYZ_INT`), and half-float decoding.
- **RGG string parsing:** CP932/Shift-JIS encoding, checksum validation, null termination.
- **Full parse integration:** Synthetic binary data constructed in the test, parsed, and output compared.

### Test fixtures

Real game files are copyrighted and must never be committed. They go in `fixtures/` which is gitignored.

Synthetic fixtures (constructed in test code) can be committed freely since they contain no copyrighted data.

## Pull requests

1. Fork the repo and create a branch from `main`.
2. If you're adding a feature, add tests for it.
3. Make sure `pnpm lint` and `pnpm test:run` pass.
4. Write a clear PR description explaining what and why.
5. Keep PRs focused. One feature or fix per PR.

### Before submitting

```bash
pnpm lint
pnpm test:run
pnpm build
```

All three must pass.

## Adding support for a new format

If you want to add parsing for a new RGG Studio format:

1. Check if a Python/Blender reference implementation exists and verify its license.
2. Open an issue describing the format, which games use it, and what reference implementation you'd port from.
3. Parser goes in its own package under `packages/` with zero dependencies.
4. Three.js integration goes in a separate package that depends on the parser.
5. Include tests with synthetic fixtures.

## Reporting issues

When reporting a parsing bug, include:

- Which game the file is from (Y0, YK1, Y3, Y5, etc.)
- The file path within the game's directory structure
- What you expected vs what happened
- The version of `@three-yakuza/*` you're using

Do NOT attach copyrighted game files to issues.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
