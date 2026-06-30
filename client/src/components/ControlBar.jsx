export default function ControlBar({ status, micOn, camOn, onToggleMic, onToggleCam, participantCount }) {
  return (
    <div className="control-bar">
      <div className="control-bar-status">
        <span className={`status-dot status-dot-${status}`} />
        <span>{status}</span>
        <span className="control-bar-count">{participantCount} in session</span>
      </div>
      <div className="control-bar-buttons">
        <button onClick={onToggleMic} className={micOn ? "btn" : "btn btn-off"}>
          {micOn ? "Mute" : "Unmute"}
        </button>
        <button onClick={onToggleCam} className={camOn ? "btn" : "btn btn-off"}>
          {camOn ? "Camera Off" : "Camera On"}
        </button>
      </div>
    </div>
  );
}
