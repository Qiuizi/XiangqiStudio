# Xiangqi Studio

A local Chinese chess analysis workstation powered by the Pikafish engine.

Xiangqi Studio 是一个基于 Pikafish 引擎的本地中国象棋分析工作站。

**Current version: v1.0.0 — First stable release**

## Features

- Human vs. AI play
- Deep local engine analysis
- MultiPV candidate-line analysis
- Endgame study
- Game replay and move-by-move study
- Variation tree for exploring alternate lines
- FEN import and export
- Local Pikafish engine and configurable engine options

## Screenshots

There are no product screenshots in the repository yet. Genuine screenshots can be added to [`docs/images/`](docs/images/).

- Home screen — reserved
- Human vs. AI board — reserved
- Engine analysis — reserved
- Replay and variations — reserved

## Architecture

- **Frontend:** Vue 3 + TypeScript
- **Desktop:** Tauri 2
- **Backend:** Rust
- **Engine:** Pikafish, running locally

## Installation

**Windows:** Download the [v1.0.0 installer](https://github.com/Qiuizi/XiangqiStudio/releases/download/v1.0.0/xiangqistudio_1.0.0_x64-setup.exe), or browse [all GitHub Releases](https://github.com/Qiuizi/XiangqiStudio/releases).

## Development

Requirements: Node.js 24, pnpm 11, and the Rust toolchain and platform dependencies required by Tauri 2.

```bash
git clone https://github.com/Qiuizi/XiangqiStudio.git
cd XiangqiStudio
pnpm install
pnpm test
pnpm build
```

To run the desktop application in development mode or build a desktop release:

```bash
pnpm tauri dev
pnpm tauri build
```

## License

Xiangqi Studio is distributed under the [GNU General Public License v3.0](LICENSE).
Pikafish is a separate project. Its source code and neural network weights are subject to their respective upstream licenses and notices; see the license materials included under [`src-tauri/resources/licenses/`](src-tauri/resources/licenses/) and the [Pikafish project](https://github.com/official-pikafish/Pikafish). Xiangqi Studio does not claim ownership of Pikafish or its weights.
