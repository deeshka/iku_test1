# iku

Lightweight single-room WebRTC video call with a split-screen collaborative
workspace (whiteboard, shared notes, shared code editor, document viewer).
There is exactly one global session — no auth, no room IDs, no database.

## Architecture overview

```
client/   React + Vite UI. Owns WebRTC peer connections (mesh) and renders
          the video grid + workspace. Talks to the server only over one
          WebSocket per browser tab.

server/   Node + ws signaling server. Relays WebRTC offers/answers/ICE
          candidates between peers and rebroadcasts collaboration events
          (whiteboard strokes, notes text, code text). Keeps the latest
          room state in memory only (lost on restart) so late joiners can
          catch up. It never touches media — audio/video never passes
          through the server.
```

Two processes, no extra services: the signaling server (port 8080) and the
Vite dev server (port 5173). In production you'd `vite build` and serve the
static `client/dist` from any static host or from the same Node process;
that's left out of the MVP to keep the run path simple.

## WebRTC connection flow

1. Browser opens a WebSocket to the signaling server and sends `join`.
2. Server replies with `welcome`: your id, the list of already-connected
   peers, and the current room state (notes/code text, whiteboard strokes).
3. **Only the new peer initiates.** For each existing peer in the welcome
   list, the new joiner creates an `RTCPeerConnection`, adds its local
   tracks, and sends an `offer` through the server (relayed to that one
   peer by id). Existing peers never initiate toward a newcomer — they just
   wait for that offer. This single-initiator rule is what avoids signaling
   glare (two peers racing to create offers to each other) without needing
   a full polite/impolite negotiation protocol.
4. The receiving peer creates its own `RTCPeerConnection`, sets the remote
   offer, creates an `answer`, and sends it back (relayed by id again).
5. Both sides exchange ICE candidates the same way (relayed by id); any
   candidate that arrives before the remote description is set is queued
   and flushed right after `setRemoteDescription`.
6. `ontrack` attaches the incoming media stream to a `<video>` tile.
   `onconnectionstatechange` drives the small status pill shown per tile
   (`connecting` / `connected` / `disconnected` / `failed`).
7. On `peer-left` (server detects the WebSocket closing) every local
   `RTCPeerConnection` for that id is closed and the tile is removed.
8. Mute / camera-off just flips `track.enabled` locally — no renegotiation,
   no extra signaling round-trip.

Result: full mesh topology (every peer connects directly to every other
peer). Fine for the 2–4 person target; mesh bandwidth scales O(n²) so it's
not meant to go much beyond that without an SFU, which is explicitly out of
scope for this MVP.

Collaboration (whiteboard/notes/code) is sent over the **same WebSocket**,
not WebRTC data channels. That's a deliberate simplification: data channels
would need their own negotiation/renegotiation handling per peer for no
real benefit here, since the signaling server is already in the loop and
collaboration state needs a "latest state" snapshot for late joiners
anyway.

## File structure

```
iku_test1/
├── client/
│   ├── index.html
│   ├── vite.config.js
│   ├── package.json
│   └── src/
│       ├── main.jsx
│       ├── App.jsx              # join gate + layout
│       ├── App.css
│       ├── hooks/
│       │   └── useWebRTC.js     # signaling client + mesh peer logic
│       └── components/
│           ├── ControlBar.jsx   # status, mute, camera toggle
│           ├── VideoGrid.jsx    # local + remote video tiles
│           ├── Whiteboard.jsx   # canvas, synced strokes
│           ├── Notes.jsx        # shared textarea, last-write-wins
│           ├── CodeEditor.jsx   # Monaco editor, last-write-wins
│           └── DocumentViewer.jsx # local-only image/PDF viewer
├── server/
│   ├── index.js                 # http + ws signaling/collab relay
│   └── package.json
└── README.md
```

No `/shared` folder — the message shapes are documented here and small
enough that a shared types package would be more ceremony than it's worth.

## Run commands

Two terminals, from `iku_test1/`:

```bash
# Terminal 1 — signaling server (port 8080)
cd server
npm install
npm start

# Terminal 2 — client dev server (port 5173)
cd client
npm install
npm run dev
```

Open `http://localhost:5173` in a browser tab. Open it again in a second
tab (or another device) to bring in a second participant — there's no room
to pick, you're automatically in the same session.

If the signaling server runs on a non-default port, set
`VITE_SIGNALING_PORT` for the client (e.g. in `client/.env`).

## Multi-user testing instructions

**Same machine:** open two browser tabs/windows at `localhost:5173`. Most
browsers allow two `getUserMedia` capture sessions; if your OS only allows
one app to hold the camera, open one tab in a regular window and one in an
incognito/private window (separate camera permission), or test one tab with
camera and the other with permission denied (it still joins, see
Limitations).

**Same WiFi, different devices:** Vite is configured with `host: true`, so
it's reachable on your LAN. Run both servers, find your machine's LAN IP
(`ifconfig` / `ipconfig`), and on the other device open
`http://<your-LAN-ip>:5173`. Camera access requires either `localhost` or
HTTPS — see the constraint below.

**Different networks / over the internet:** WebRTC media needs to traverse
NATs. This setup ships with a public STUN server only
(`stun:stun.l.google.com:19302`), which is enough when at least one side is
on an open/moderate NAT. If both sides are behind restrictive/symmetric
NATs (common on corporate networks or some mobile carriers), the
peer-to-peer connection will fail to establish and you'd need a TURN
server (e.g. coturn, or a hosted TURN provider) added to `ICE_SERVERS` in
`client/src/hooks/useWebRTC.js`. No TURN is included by default to keep the
project free of external dependencies/credentials.

**HTTPS constraint:** browsers only allow `getUserMedia` (camera/mic) on
`https://` origins or `http://localhost`. Plain `http://<lan-ip>:5173`
works in Chrome for LAN testing in practice, but isn't guaranteed across
browsers. For real cross-device/cross-network testing, put both the client
and signaling server behind a tunnel that gives you HTTPS, e.g.:

```bash
npx ngrok http 5173        # client
npx ngrok http 8080        # signaling server, then set VITE_SIGNALING_PORT
```

(or Cloudflare Tunnel / `cloudflared tunnel --url http://localhost:5173`).
Tunneling is not wired into the app — it's an external step you run
yourself when you need off-LAN access.

## Known limitations

- **No automatic reconnection of a single failed peer connection.** If one
  peer's ICE connection fails (e.g. NAT change mid-call) that one tile is
  torn down; the rest of the mesh is unaffected, but that user must
  rejoin (refresh) to reconnect. Full WebSocket disconnects *do*
  auto-reconnect with a 2s retry.
- **No TURN server.** Calls across strict NATs/firewalls may fail to
  connect peer-to-peer (see above).
- **Mesh topology only**, not an SFU — bandwidth/CPU scale O(n²) with
  participants. Fine for 2–4 people, not meant for more.
- **Last-write-wins** for notes and code — no operational transforms or
  CRDTs, so two people typing in the exact same spot at the same instant
  can clobber each other. Acceptable for an MVP per the spec.
- **Document viewer is local-only**, not synced — each participant opens
  their own file. Broadcasting raw file bytes to every peer over the
  signaling WebSocket would work against the "lightweight, no upload
  backend" constraint, so it was intentionally left out.
- **Whiteboard history is unbounded-but-capped** in server memory (last
  5000 strokes) and is lost on server restart, like all other room state.
- **No persistence whatsoever.** Refreshing the page is fine (room state
  is replayed from the server), but restarting the signaling server wipes
  notes/code/whiteboard.

## Why these design choices were made

- **Single global room, no auth/DB:** explicitly required — this is a
  prototype testing whether a real-time system can be built without
  unnecessary infrastructure, not a product with users/accounts.
- **`ws` instead of Socket.IO:** Socket.IO bundles a fallback transport
  layer, rooms/namespaces, and reconnection logic we don't need since the
  client already implements its own reconnect; `ws` is a thin, dependency-
  light WebSocket implementation that does exactly the relay job required.
- **Collaboration over WebSocket, not WebRTC data channels:** the
  signaling server is already in the data path for every client, already
  needs to hold "current state" for late joiners, and broadcasting JSON
  over an existing connection is far simpler than negotiating N data
  channels per peer for marginal benefit at this scale.
- **New-peer-initiates rule for the mesh:** removes the need for a
  polite/impolite glare-resolution protocol, which is the single biggest
  source of WebRTC mesh bugs in naive implementations.
- **In-memory room state, no DB:** state is small (text + stroke list),
  ephemeral by design (it's a live session, not a document store), and a
  database would be pure overhead for an MVP that's explicitly disposable.
- **Monaco for the code editor:** the spec requires syntax highlighting; a
  hand-rolled highlighter would be more code and worse UX than a single,
  well-justified dependency.

## Dependencies (with justification)

**server/**
- `ws` — minimal WebSocket server; the entire signaling/collab relay is
  built on it. No HTTP framework (Express, etc.) was needed since the
  server doesn't serve any pages or REST routes, just a `/health` check.

**client/**
- `react`, `react-dom` — UI rendering; required by the component structure
  (video grid, workspace panels, live state updates).
- `@vitejs/plugin-react`, `vite` — dev server + build tool; Vite gives fast
  HMR and a tiny, simple config compared to webpack-based setups.
- `@monaco-editor/react` — the only UI dependency beyond React; provides
  JavaScript syntax highlighting for the shared code editor (loads the
  Monaco runtime from a CDN by default, so it doesn't bloat the local
  install).

No state-management library (Redux etc.), no UI component library, no
real-time framework beyond raw WebSocket/WebRTC, no Docker, no database.

Total install size: server `node_modules` ≈ 200 KB, client `node_modules`
≈ 115 MB (dominated by Monaco + Vite's bundled esbuild) — well under the
~1 GB budget.
