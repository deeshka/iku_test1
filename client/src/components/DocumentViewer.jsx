import { useState } from "react";

// Viewing only, and intentionally local to each user: broadcasting raw file
// bytes to every peer over the WebSocket would violate the lightweight/no
// upload-backend constraint, so each participant loads their own file.
export default function DocumentViewer() {
  const [fileUrl, setFileUrl] = useState(null);
  const [fileType, setFileType] = useState(null);
  const [fileName, setFileName] = useState(null);

  const handleFile = (evt) => {
    const file = evt.target.files?.[0];
    if (!file) return;
    setFileUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
    setFileType(file.type);
    setFileName(file.name);
  };

  return (
    <div className="panel doc-panel">
      <div className="panel-header">
        <span>Document Viewer</span>
        <label className="btn">
          Open file
          <input type="file" accept="image/*,application/pdf" onChange={handleFile} hidden />
        </label>
      </div>
      <div className="doc-body">
        {!fileUrl && <div className="doc-empty">Open a local image or PDF to view it (not shared with others).</div>}
        {fileUrl && fileType?.startsWith("image/") && <img src={fileUrl} alt={fileName} />}
        {fileUrl && fileType === "application/pdf" && <iframe title={fileName} src={fileUrl} />}
        {fileUrl && !fileType?.startsWith("image/") && fileType !== "application/pdf" && (
          <div className="doc-empty">Unsupported file type: {fileType || "unknown"}</div>
        )}
      </div>
    </div>
  );
}
