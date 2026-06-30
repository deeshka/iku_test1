import { useEffect, useRef, useState } from "react";
import Editor from "@monaco-editor/react";

const DEBOUNCE_MS = 150;

export default function CodeEditor({ initialText, collabMessage, sendCollab }) {
  const [code, setCode] = useState(initialText || "// shared scratchpad\n");
  const initialized = useRef(false);
  const debounceRef = useRef(null);
  const applyingRemoteRef = useRef(false);

  useEffect(() => {
    if (!initialized.current && initialText) {
      setCode(initialText);
      initialized.current = true;
    }
  }, [initialText]);

  useEffect(() => {
    if (!collabMessage || collabMessage.payload?.channel !== "code") return;
    applyingRemoteRef.current = true;
    setCode(collabMessage.payload.text);
  }, [collabMessage]);

  const handleChange = (value) => {
    if (applyingRemoteRef.current) {
      applyingRemoteRef.current = false;
      return;
    }
    setCode(value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      sendCollab({ channel: "code", text: value });
    }, DEBOUNCE_MS);
  };

  return (
    <div className="panel code-panel">
      <div className="panel-header">
        <span>Code Editor</span>
        <span className="panel-hint">basic sync · last write wins</span>
      </div>
      <Editor
        height="100%"
        defaultLanguage="javascript"
        theme="vs-dark"
        value={code}
        onChange={handleChange}
        options={{ minimap: { enabled: false }, fontSize: 13 }}
      />
    </div>
  );
}
