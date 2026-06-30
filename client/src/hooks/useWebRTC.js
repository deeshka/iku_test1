import { useCallback, useEffect, useRef, useState } from "react";

// Public STUN only. No TURN is bundled (see README) -- works on the same
// network or open NATs; restrictive/symmetric NATs across networks will
// need a TURN server added here.
const ICE_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }];

function getSignalingUrl() {
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  const port = import.meta.env.VITE_SIGNALING_PORT || 8080;
  return `${protocol}://${window.location.hostname}:${port}`;
}

export function useWebRTC(name) {
  const [selfId, setSelfId] = useState(null);
  const [status, setStatus] = useState("connecting"); // connecting | connected | disconnected
  const [localStream, setLocalStream] = useState(null);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [peersState, setPeersState] = useState({}); // id -> { name, stream, connectionState }
  const [roomState, setRoomState] = useState(null); // initial notes/code/whiteboard snapshot
  const [collabMessage, setCollabMessage] = useState(null); // latest incoming collab event

  const wsRef = useRef(null);
  const localStreamRef = useRef(null);
  const pcsRef = useRef(new Map()); // id -> RTCPeerConnection
  const pendingCandidatesRef = useRef(new Map()); // id -> RTCIceCandidate[]
  const namesRef = useRef(new Map()); // id -> name
  const [mediaReady, setMediaReady] = useState(false);

  const updatePeer = useCallback((id, patch) => {
    setPeersState((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }, []);

  const removePeer = useCallback((id) => {
    setPeersState((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const sendSignal = useCallback((to, data) => {
    wsRef.current?.send(JSON.stringify({ type: "signal", to, data }));
  }, []);

  const createPeerConnection = useCallback(
    (id) => {
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      pcsRef.current.set(id, pc);
      pendingCandidatesRef.current.set(id, []);

      if (localStreamRef.current) {
        for (const track of localStreamRef.current.getTracks()) {
          pc.addTrack(track, localStreamRef.current);
        }
      }

      const remoteStream = new MediaStream();
      pc.ontrack = (event) => {
        event.streams[0]?.getTracks().forEach((t) => remoteStream.addTrack(t));
        updatePeer(id, { stream: remoteStream, name: namesRef.current.get(id) });
      };

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          sendSignal(id, { kind: "candidate", candidate: event.candidate });
        }
      };

      pc.onconnectionstatechange = () => {
        updatePeer(id, { connectionState: pc.connectionState });
        if (pc.connectionState === "failed" || pc.connectionState === "closed") {
          pc.close();
          pcsRef.current.delete(id);
        }
      };

      return pc;
    },
    [sendSignal, updatePeer]
  );

  const getOrCreatePeerConnection = useCallback(
    (id) => pcsRef.current.get(id) || createPeerConnection(id),
    [createPeerConnection]
  );

  const flushCandidates = useCallback(async (id, pc) => {
    const queue = pendingCandidatesRef.current.get(id) || [];
    pendingCandidatesRef.current.set(id, []);
    for (const candidate of queue) {
      try {
        await pc.addIceCandidate(candidate);
      } catch (err) {
        console.warn("Failed to add queued ICE candidate", err);
      }
    }
  }, []);

  const makeOffer = useCallback(
    async (id) => {
      const pc = getOrCreatePeerConnection(id);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      sendSignal(id, { kind: "offer", sdp: pc.localDescription });
    },
    [getOrCreatePeerConnection, sendSignal]
  );

  // Only the newly-joined peer ever initiates an offer to peers it already
  // knows about (from "welcome"); existing peers just wait for that offer.
  // This single-initiator rule avoids signaling glare without needing a
  // polite/impolite negotiation protocol.
  const handleSignal = useCallback(
    async (from, data) => {
      if (data.kind === "offer") {
        const pc = getOrCreatePeerConnection(from);
        await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
        await flushCandidates(from, pc);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        sendSignal(from, { kind: "answer", sdp: pc.localDescription });
      } else if (data.kind === "answer") {
        const pc = pcsRef.current.get(from);
        if (!pc) return;
        await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
        await flushCandidates(from, pc);
      } else if (data.kind === "candidate") {
        const pc = pcsRef.current.get(from);
        const candidate = new RTCIceCandidate(data.candidate);
        if (pc && pc.remoteDescription) {
          try {
            await pc.addIceCandidate(candidate);
          } catch (err) {
            console.warn("Failed to add ICE candidate", err);
          }
        } else {
          const queue = pendingCandidatesRef.current.get(from) || [];
          queue.push(candidate);
          pendingCandidatesRef.current.set(from, queue);
        }
      }
    },
    [flushCandidates, getOrCreatePeerConnection, sendSignal]
  );

  const closePeer = useCallback(
    (id) => {
      const pc = pcsRef.current.get(id);
      if (pc) {
        pc.close();
        pcsRef.current.delete(id);
      }
      pendingCandidatesRef.current.delete(id);
      namesRef.current.delete(id);
      removePeer(id);
    },
    [removePeer]
  );

  // Acquire local camera/mic once. Joining still proceeds without media if
  // permission is denied or no devices exist -- a peer can view/listen and
  // use the collaboration panels either way.
  useEffect(() => {
    let cancelled = false;

    navigator.mediaDevices
      .getUserMedia({ video: true, audio: true })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        localStreamRef.current = stream;
        setLocalStream(stream);
      })
      .catch((err) => {
        console.warn("getUserMedia failed, joining without local media", err);
      })
      .finally(() => {
        if (!cancelled) setMediaReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!mediaReady) return;
    let stopped = false;
    let reconnectTimer = null;

    function connect() {
      const ws = new WebSocket(getSignalingUrl());
      wsRef.current = ws;

      ws.onopen = () => {
        setStatus("connected");
        ws.send(JSON.stringify({ type: "join", name }));
      };

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        switch (msg.type) {
          case "welcome": {
            setSelfId(msg.id);
            setRoomState(msg.state);
            msg.peers.forEach((p) => {
              namesRef.current.set(p.id, p.name);
              updatePeer(p.id, { name: p.name, connectionState: "connecting" });
              makeOffer(p.id);
            });
            break;
          }
          case "peer-joined": {
            namesRef.current.set(msg.id, msg.name);
            updatePeer(msg.id, { name: msg.name, connectionState: "connecting" });
            break;
          }
          case "peer-left": {
            closePeer(msg.id);
            break;
          }
          case "signal": {
            handleSignal(msg.from, msg.data);
            break;
          }
          case "collab": {
            setCollabMessage({ from: msg.from, payload: msg.payload, ts: Date.now() + Math.random() });
            break;
          }
          default:
            break;
        }
      };

      ws.onclose = () => {
        if (stopped) return;
        setStatus("disconnected");
        for (const id of [...pcsRef.current.keys()]) closePeer(id);
        reconnectTimer = setTimeout(connect, 2000);
      };

      ws.onerror = () => ws.close();
    }

    connect();

    return () => {
      stopped = true;
      clearTimeout(reconnectTimer);
      wsRef.current?.close();
      for (const id of [...pcsRef.current.keys()]) closePeer(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaReady, name]);

  const toggleMic = useCallback(() => {
    setMicOn((prev) => {
      const next = !prev;
      localStreamRef.current?.getAudioTracks().forEach((t) => (t.enabled = next));
      return next;
    });
  }, []);

  const toggleCam = useCallback(() => {
    setCamOn((prev) => {
      const next = !prev;
      localStreamRef.current?.getVideoTracks().forEach((t) => (t.enabled = next));
      return next;
    });
  }, []);

  const sendCollab = useCallback((payload) => {
    wsRef.current?.send(JSON.stringify({ type: "collab", payload }));
  }, []);

  return {
    selfId,
    status,
    localStream,
    micOn,
    camOn,
    toggleMic,
    toggleCam,
    peers: peersState,
    roomState,
    collabMessage,
    sendCollab,
  };
}
