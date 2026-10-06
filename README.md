# skribbl.io Clone — Real-Time Multiplayer Drawing & Guessing Game

An end-to-end clone of [skribbl.io](https://skribbl.io/) built with **React 19**, **TypeScript**, **Vite**, **Node.js**, **Express**, and **Socket.IO WebSockets**.

The application features server-authoritative state management, 1-click public matchmaking, private room codes, a professional understated user interface, real-time synchronized canvas drawing with normalized coordinates, progressive timed word hints, an anti-spoiler chat shield, and a speed-based scoring engine. It is architected to deploy as a **single unified web service on Render**.

---

## Features & Highlights

* **Multiplayer Matchmaking & Rooms:**
  * **1-Click Public Matchmaking:** Jump straight into an active public lobby without needing invite links.
  * **Private Rooms:** Host games with custom 6-character room codes or direct shareable invite links (`/?room=CODE`).
  * **Lobby Controls & Settings:** Host controls for player capacity (2-20), rounds (2-10), draw time (15-240s), word count (1-5), and hints (0-5).
  * **Automatic Host Migration:** Seamless transfer of host authority to the oldest connected player upon host disconnection.
  * **Strict 2-Player Minimum:** Server strictly enforces that at least 2 connected players are present before starting.
* **Understated, Accessible Interface:**
  * Clean neutral palette with a subtle blue accent, high contrast text, and visible keyboard focus.
  * Zero emojis, no flashy gradients, and no decorative clutter.
* **Real-Time Drawing Engine:**
  * **Normalized Coordinates:** Captures canvas strokes as relative floating-point ratios (`0.0`–`1.0`), guaranteeing distortion-free rendering across any screen resolution or mobile device.
  * **Drawer Toolkit:** 16 colors, 4 stroke sizes, eraser, undo last stroke, and wipe canvas.
* **Word & Guessing System:**
  * **Curated Word Bank:** Embedded ~300 common, easy-to-draw English nouns.
  * **Secret Word Secrecy:** Secret words are never transmitted to guessers over WebSockets. Guessers see only masked blanks (`_ _ _ _`).
  * **Anti-Spoiler Chat Shield:** Correct guesses are suppressed from chat to prevent spoiling for other players, accompanied by a public celebration banner.
  * **Timed Letter Hints:** Automatic progressive letter reveals at 50% and 75% elapsed turn time.
* **Authoritative Scoring:**
  * **Speed-Scaled Points:** Guessers earn 100 to 550 points based on time remaining and first-guess bonus.
  * **Drawer Rewards:** Drawer receives 75 points per successful guesser.
  * **Live Leaderboard & Podium:** Real-time player rankings with end-of-game celebration.

---

## Architecture & Technology Stack

The project is structured as a clean monorepo powered by **npm workspaces**:

* **Frontend (`client/`):** React 19, TypeScript, Vite, HTML5 Canvas API, Socket.IO Client.
* **Backend (`server/`):** Node.js, Express, Socket.IO, TypeScript.
* **Contracts (`shared/`):** Shared TypeScript types, event constants, and data payloads (`@skribbl/shared`).
* **Hosting:** Single unified web service on **Render** (Express statically serves the compiled Vite client bundle from `/` and attaches Socket.IO to the exact same HTTP port).

```text
skribbl-clone/
├── render.yaml                  # Render Blueprint definition
├── package.json                 # Monorepo workspaces runner
├── shared/                      # @skribbl/shared data models & Socket.IO event names
├── client/                      # React 19 + TypeScript + Vite UI
├── server/                      # Node.js + Express + Socket.IO server
├── docs/                        # Architecture, game rules, and design records
└── scripts/                     # Automated milestone verification checks
```

---

## Getting Started Locally

### Prerequisites
* **Node.js:** v18.0.0 or higher
* **npm:** v9.0.0 or higher

### Installation
Clone the repository and install dependencies across all monorepo workspaces:
```bash
git clone https://github.com/Megxeter/skribble-clone.git
cd skribbl-clone
npm install
```

### 1. Run in Development Mode (Hot Reloading)
```bash
npm run dev
```
* **Frontend Dev Server:** `http://localhost:5173` (Vite with HMR; automatically proxies `/socket.io` and `/health` to port 3000)
* **Backend WebSocket Server:** `http://localhost:3000`

### 2. Compile Production Bundle
```bash
npm run build
```
Compiles the shared package, bundles the React client into `client/dist`, and transpiles the server into `server/dist`.

### 3. Run Production Server (Unified Single Port)
```bash
npm run start
```
Express starts on port 3000, hosts the production static frontend, and handles Socket.IO connections:
* Open: **`http://localhost:3000`**

### 4. Run Automated Milestone Verifications
```bash
# Milestone 1: Healthcheck, static frontend bundle serving, Socket.IO connection
npm run test:m1

# Milestone 2: Multi-client matchmaking, private codes, capacity, settings, host migration, 2-player start
npm run test:m2

# Milestone 3: Game loop, word selection secrecy, synchronized canvas, drawer-only authority, hints
npm run test:m3
```

---

## Deployment on Render

The app deploys as a **Single Web Service** on Render, eliminating CORS configurations and WebSocket proxy complications on free tiers.

### Method A: Blueprint Deployment (`render.yaml`)
1. Push this repository to GitHub.
2. In the [Render Dashboard](https://dashboard.render.com/), choose **New + > Blueprint**.
3. Connect your repository. Render automatically reads `render.yaml` and provisions the unified web service.

### Method B: Manual Web Service Setup
1. In the Render Dashboard, click **New + > Web Service**.
2. Connect your repository and configure:
   * **Runtime:** `Node`
   * **Build Command:** `npm run build`
   * **Start Command:** `npm run start`
   * **Health Check Path:** `/health`
   * **Plan Type:** `Free`

---

## Detailed Documentation

* [docs/architecture.md](docs/architecture.md) — Complete system architecture, state machine, and data flow.
* [docs/game-rules.md](docs/game-rules.md) — Configurable ranges, turn rotation, hints, and scoring formulas.
* [docs/decisions.md](docs/decisions.md) — Confirmed technical decisions and design rationale.

---

## License
MIT
