# Xiangqi Studio

A local Chinese chess analysis application powered by Pikafish engine.

**Version 1.0.0 — First stable release**

## Features

- Local AI engine
- Pikafish integration
- Human vs AI
- Endgame study
- Replay and variation analysis
- MultiPV analysis
- Engine configuration

## Screenshots

Screenshots will be published in [`docs/images/`](docs/images/).

## Architecture

- **Frontend:** Vue 3 + TypeScript
- **Desktop:** Tauri 2 + Rust
- **Engine:** Pikafish, running locally

## Installation

On Windows, download the installer (`.exe`) from the [GitHub Releases](https://github.com/Qiuizi/XiangqiStudio/releases) page.

## Development

Requirements: Node.js, pnpm, and the Rust toolchain required by Tauri 2.

```bash
pnpm install
pnpm dev
pnpm tauri build
```

## License

Xiangqi Studio is distributed under the [GNU General Public License v3.0](LICENSE).
Pikafish is a separate project. Its source code and neural network weights are subject to their respective upstream licenses and notices; see the license materials included under [`src-tauri/resources/licenses/`](src-tauri/resources/licenses/) and the [Pikafish project](https://github.com/official-pikafish/Pikafish). Xiangqi Studio does not claim ownership of Pikafish or its weights.
