import { useMemo, useState } from "react";
import { useWebRTC } from "./hooks/useWebRTC.js";
import VideoGrid from "./components/VideoGrid.jsx";
import ControlBar from "./components/ControlBar.jsx";
import Whiteboard from "./components/Whiteboard.jsx";
import Notes from "./components/Notes.jsx";
import CodeEditor from "./components/CodeEditor.jsx";
import DocumentViewer from "./components/DocumentViewer.jsx";

function JoinGate({ onJoin }) {
  const [name, setName] = useState("");

  return (
    <div className="join-gate">
      <div className="join-card">
        <h1>iku</h1>
        <p>Single shared session — everyone who joins lands in the same room.</p>
        <input
          autoFocus
          placeholder="Your display name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onJoin(name)}
        />
        <button className="btn btn-primary" onClick={() => onJoin(name)}>
          Join session
        </button>
      </div>
    </div>
  );
}

function BottomRightTabs({ roomState, collabMessage, sendCollab }) {
  const [tab, setTab] = useState("notes");

  return (
    <div className="panel tabbed-panel">
      <div className="panel-header">
        <div className="tab-strip">
          <button className={tab === "notes" ? "tab tab-active" : "tab"} onClick={() => setTab("notes")}>
            Notes
          </button>
          <button className={tab === "docs" ? "tab tab-active" : "tab"} onClick={() => setTab("docs")}>
            Docs
          </button>
        </div>
      </div>
      <div className="tabbed-panel-body">
        {tab === "notes" ? (
          <Notes initialText={roomState?.notesText} collabMessage={collabMessage} sendCollab={sendCollab} />
        ) : (
          <DocumentViewer />
        )}
      </div>
    </div>
  );
}

export default function App() {
  const [name, setName] = useState(null);
  const display = useMemo(() => name || "Guest", [name]);

  const {
    selfId,
    status,
    localStream,
    micOn,
    camOn,
    toggleMic,
    toggleCam,
    peers,
    roomState,
    collabMessage,
    sendCollab,
  } = useWebRTC(name || "");

  if (!name) {
    return <JoinGate onJoin={(n) => setName(n.trim() || `Guest-${Math.floor(Math.random() * 9000 + 1000)}`)} />;
  }

  return (
    <div className="app-shell">
      <ControlBar
        status={status}
        micOn={micOn}
        camOn={camOn}
        onToggleMic={toggleMic}
        onToggleCam={toggleCam}
        participantCount={Object.keys(peers).length + 1}
      />
      <div className="main-grid">
        <div className="panel video-panel">
          <div className="panel-header">
            <span>Video</span>
          </div>
          <VideoGrid localStream={localStream} selfName={display} peers={peers} />
        </div>
        <Whiteboard
          initialStrokes={roomState?.whiteboardStrokes}
          collabMessage={collabMessage}
          sendCollab={sendCollab}
        />
        <CodeEditor initialText={roomState?.codeText} collabMessage={collabMessage} sendCollab={sendCollab} />
        <BottomRightTabs roomState={roomState} collabMessage={collabMessage} sendCollab={sendCollab} />
      </div>
      {selfId && <div className="self-id">id: {selfId.slice(0, 8)}</div>}
    </div>
  );
}
