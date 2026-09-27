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

## Screenshot

Real application screenshots will be displayed here when available. Place only genuine screenshots in [`docs/images/`](docs/images/).

<!-- Uncomment each image after adding the corresponding real screenshot:
![Home screen](docs/images/home.png)
![Engine analysis](docs/images/analysis.png)
![Endgame study](docs/images/study.png)
![Xiangqi Studio demo](docs/images/demo.gif)
-->

## Installation

### Windows x64

1. Download the [Xiangqi Studio v1.0.0 Windows x64 installer](https://github.com/Qiuizi/XiangqiStudio/releases/download/v1.0.0/xiangqistudio_1.0.0_x64-setup.exe) from GitHub Releases.
2. Run the installer and follow the setup steps.
3. Launch Xiangqi Studio.

## First Run

1. Choose **人机对战** (Human vs. AI) on the home screen to start a game against Pikafish.
2. Choose **残局研究** (Endgame Study) to set up a position or load one with FEN.
3. In **对战模式**, open **AI 分析** and select **开始分析** to analyze the current board position.

## Architecture

- **Frontend:** Vue 3 + TypeScript
- **Desktop:** Tauri 2
- **Backend:** Rust
- **Engine:** Pikafish, running locally

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
