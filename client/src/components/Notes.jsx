import { useEffect, useRef, useState } from "react";

const DEBOUNCE_MS = 150;

export default function Notes({ initialText, collabMessage, sendCollab }) {
  const [text, setText] = useState(initialText || "");
  const initialized = useRef(false);
  const debounceRef = useRef(null);

  useEffect(() => {
    if (!initialized.current && initialText) {
      setText(initialText);
      initialized.current = true;
    }
  }, [initialText]);

  useEffect(() => {
    if (!collabMessage || collabMessage.payload?.channel !== "notes") return;
    setText(collabMessage.payload.text);
  }, [collabMessage]);

  const handleChange = (evt) => {
    const value = evt.target.value;
    setText(value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      sendCollab({ channel: "notes", text: value });
    }, DEBOUNCE_MS);
  };

  return (
    <div className="panel notes-panel">
      <div className="panel-header">
        <span>Notes</span>
        <span className="panel-hint">shared live text · last write wins</span>
      </div>
      <textarea className="notes-textarea" value={text} onChange={handleChange} placeholder="Type shared notes here..." />
    </div>
  );
}
