# Contributing

Issues and pull requests are welcome. Please keep changes focused and describe the behavior you observed.

## Report an issue

Use the issue templates to report a reproducible bug or propose an improvement. Include the Xiangqi Studio version, operating system, steps to reproduce, expected behavior, and actual behavior. Remove personal information from logs before sharing them.

## Submit a pull request

1. Open or link an issue when the change affects user-visible behavior.
2. Create a focused branch from `main`.
3. Keep the change limited to its stated purpose and update documentation when needed.
4. Run `pnpm test` and `pnpm build` locally.
5. Open a pull request against `main`, explain the change, and report the checks you ran.

## Development environment

- Node.js 24
- pnpm 11 (the repository pins pnpm 11.9.0 in `package.json`)
- Rust toolchain and platform prerequisites required by Tauri 2

```bash
pnpm install
pnpm test
pnpm build
```

For the desktop application, use `pnpm tauri dev`. A platform release build uses `pnpm tauri build` and requires that platform's Tauri build dependencies.
