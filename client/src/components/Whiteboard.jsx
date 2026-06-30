import { useCallback, useEffect, useRef, useState } from "react";

const COLORS = ["#1f2937", "#ef4444", "#3b82f6", "#22c55e", "#eab308", "#ffffff"];
const CANVAS_W = 1000;
const CANVAS_H = 600;

function drawSegment(ctx, stroke) {
  const { from, to, color, size } = stroke;
  ctx.strokeStyle = color;
  ctx.lineWidth = size;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
}

export default function Whiteboard({ initialStrokes, collabMessage, sendCollab }) {
  const canvasRef = useRef(null);
  const ctxRef = useRef(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef(null);
  const [color, setColor] = useState(COLORS[0]);
  const [size, setSize] = useState(3);

  useEffect(() => {
    const canvas = canvasRef.current;
    canvas.width = CANVAS_W;
    canvas.height = CANVAS_H;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#0b1220";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ctxRef.current = ctx;

    (initialStrokes || []).forEach((stroke) => drawSegment(ctx, stroke));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!collabMessage || collabMessage.payload?.channel !== "whiteboard") return;
    const ctx = ctxRef.current;
    if (!ctx) return;
    const { action, stroke } = collabMessage.payload;
    if (action === "stroke" && stroke) {
      drawSegment(ctx, stroke);
    } else if (action === "clear") {
      ctx.fillStyle = "#0b1220";
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    }
  }, [collabMessage]);

  const toCanvasPoint = useCallback((evt) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const x = ((evt.clientX - rect.left) / rect.width) * CANVAS_W;
    const y = ((evt.clientY - rect.top) / rect.height) * CANVAS_H;
    return { x, y };
  }, []);

  const handlePointerDown = useCallback(
    (evt) => {
      drawingRef.current = true;
      lastPointRef.current = toCanvasPoint(evt);
    },
    [toCanvasPoint]
  );

  const handlePointerMove = useCallback(
    (evt) => {
      if (!drawingRef.current) return;
      const point = toCanvasPoint(evt);
      const stroke = { from: lastPointRef.current, to: point, color, size };
      drawSegment(ctxRef.current, stroke);
      sendCollab({ channel: "whiteboard", action: "stroke", stroke });
      lastPointRef.current = point;
    },
    [color, size, sendCollab, toCanvasPoint]
  );

  const stopDrawing = useCallback(() => {
    drawingRef.current = false;
  }, []);

  const handleClear = useCallback(() => {
    const ctx = ctxRef.current;
    ctx.fillStyle = "#0b1220";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    sendCollab({ channel: "whiteboard", action: "clear" });
  }, [sendCollab]);

  return (
    <div className="panel whiteboard-panel">
      <div className="panel-header">
        <span>Whiteboard</span>
        <div className="whiteboard-tools">
          {COLORS.map((c) => (
            <button
              key={c}
              className={`color-swatch ${c === color ? "color-swatch-active" : ""}`}
              style={{ background: c }}
              onClick={() => setColor(c)}
              aria-label={`color ${c}`}
            />
          ))}
          <input
            type="range"
            min="1"
            max="12"
            value={size}
            onChange={(e) => setSize(Number(e.target.value))}
          />
          <button className="btn" onClick={handleClear}>
            Clear
          </button>
        </div>
      </div>
      <canvas
        ref={canvasRef}
        className="whiteboard-canvas"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={stopDrawing}
        onPointerLeave={stopDrawing}
      />
    </div>
  );
}
