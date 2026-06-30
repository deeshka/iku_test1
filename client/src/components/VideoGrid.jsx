import { useEffect, useRef } from "react";

function VideoTile({ stream, label, muted, statusLabel }) {
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream || null;
    }
  }, [stream]);

  return (
    <div className="video-tile">
      <video ref={videoRef} autoPlay playsInline muted={muted} />
      <div className="video-tile-label">
        <span>{label}</span>
        {statusLabel && <span className="status-pill">{statusLabel}</span>}
      </div>
    </div>
  );
}

export default function VideoGrid({ localStream, selfName, peers }) {
  const peerList = Object.entries(peers);

  return (
    <div className="video-grid">
      <VideoTile stream={localStream} label={`${selfName} (you)`} muted statusLabel={null} />
      {peerList.map(([id, p]) => (
        <VideoTile
          key={id}
          stream={p.stream}
          label={p.name || "Joining..."}
          muted={false}
          statusLabel={p.connectionState && p.connectionState !== "connected" ? p.connectionState : null}
        />
      ))}
      {peerList.length === 0 && (
        <div className="video-grid-empty">Waiting for others to join the session...</div>
      )}
    </div>
  );
}
