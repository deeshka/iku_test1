import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { WebSocketServer } from "ws";

const PORT = process.env.PORT || 8080;
const MAX_WHITEBOARD_STROKES = 5000;

// Single global room: no room IDs, no routing. Every connection joins the
// same in-memory session. State lives only in process memory (no DB) and is
// lost on restart -- acceptable for an MVP single-session tool.
const peers = new Map(); // id -> { ws, name }
const room = {
  notesText: "",
  codeText: "",
  whiteboardStrokes: [],
};

function send(ws, message) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

function broadcast(message, exceptId) {
  const data = JSON.stringify(message);
  for (const [id, peer] of peers) {
    if (id !== exceptId && peer.ws.readyState === peer.ws.OPEN) {
      peer.ws.send(data);
    }
  }
}

const httpServer = createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, peers: peers.size }));
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server: httpServer });

wss.on("connection", (ws) => {
  const id = randomUUID();
  let joined = false;

  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return; // ignore malformed input
    }

    switch (msg.type) {
      case "join": {
        if (joined) return;
        joined = true;
        const name = String(msg.name || "Guest").slice(0, 40);
        peers.set(id, { ws, name });

        send(ws, {
          type: "welcome",
          id,
          peers: [...peers.entries()]
            .filter(([peerId]) => peerId !== id)
            .map(([peerId, p]) => ({ id: peerId, name: p.name })),
          state: room,
        });

        broadcast({ type: "peer-joined", id, name }, id);
        break;
      }

      case "signal": {
        // Relay WebRTC offer/answer/ICE candidates to a specific peer only.
        if (!joined || !msg.to || !peers.has(msg.to)) return;
        send(peers.get(msg.to).ws, { type: "signal", from: id, data: msg.data });
        break;
      }

      case "collab": {
        // Lightweight collaboration sync: whiteboard / notes / code.
        if (!joined || !msg.payload) return;
        const { channel } = msg.payload;

        if (channel === "whiteboard") {
          if (msg.payload.action === "clear") {
            room.whiteboardStrokes = [];
          } else if (msg.payload.action === "stroke" && msg.payload.stroke) {
            room.whiteboardStrokes.push(msg.payload.stroke);
            if (room.whiteboardStrokes.length > MAX_WHITEBOARD_STROKES) {
              room.whiteboardStrokes.shift();
            }
          }
        } else if (channel === "notes" && typeof msg.payload.text === "string") {
          room.notesText = msg.payload.text;
        } else if (channel === "code" && typeof msg.payload.text === "string") {
          room.codeText = msg.payload.text;
        }

        broadcast({ type: "collab", from: id, payload: msg.payload }, id);
        break;
      }

      default:
        break;
    }
  });

  ws.on("close", () => {
    if (joined) {
      peers.delete(id);
      broadcast({ type: "peer-left", id }, id);
    }
  });

  ws.on("error", () => {
    ws.close();
  });
});

httpServer.listen(PORT, () => {
  console.log(`Signaling server listening on http://0.0.0.0:${PORT}`);
});
