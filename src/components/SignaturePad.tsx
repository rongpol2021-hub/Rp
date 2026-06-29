import React, { useRef, useState, useEffect } from "react";
import { PenTool, Trash2, CheckCircle2 } from "lucide-react";

interface SignaturePadProps {
  onSave: (base64Signature: string | null) => void;
  savedSignature?: string | null;
}

export default function SignaturePad({ onSave, savedSignature }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSigned, setHasSigned] = useState(false);

  // Read saved signature from props if any (e.g. for restoring form)
  useEffect(() => {
    if (savedSignature && canvasRef.current) {
      // If we have an existing base64 signature, draw it on canvas
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        const img = new Image();
        img.onload = () => {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          // Recenter & draw nicely
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          setHasSigned(true);
        };
        img.src = savedSignature;
      }
    } else if (savedSignature === null || savedSignature === undefined) {
      clearCanvas();
    }
  }, [savedSignature]);

  // Adjust canvas scale for high DPI screens
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;

      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2.5;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
      }
    }
  }, []);

  const getCoordinates = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    
    // Check if touch event
    if ("touches" in e) {
      if (e.touches.length === 0) return { x: 0, y: 0 };
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top,
      };
    } else {
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    }
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault(); // Prevent scrolling on touch
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { x, y } = getCoordinates(e.nativeEvent);
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    e.preventDefault();

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const { x, y } = getCoordinates(e.nativeEvent);
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasSigned(true);
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);

    // Save output base64
    const canvas = canvasRef.current;
    if (canvas && hasSigned) {
      const dataUrl = canvas.toDataURL("image/png");
      onSave(dataUrl);
    }
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSigned(false);
    onSave(null);
  };

  return (
    <div id="signature-pad-container" className="flex flex-col w-full">
      <div className="flex items-center justify-between mb-2">
        <label className="text-sm font-sans font-medium text-stone-300 flex items-center gap-1.5">
          <PenTool size={16} className="text-emerald-500" />
          ผู้พ่น/เป่า เซ็นลายมือชื่อดิจิทัล
        </label>
        {hasSigned && (
          <button
            id="btn-clear-signature"
            type="button"
            onClick={clearCanvas}
            className="text-stone-400 hover:text-stone-200 text-xs font-sans font-medium flex items-center gap-1 bg-stone-800 hover:bg-stone-700 px-2.5 py-1 rounded-md transition border border-stone-750"
          >
            <Trash2 size={12} /> ล้างข้อมูล
          </button>
        )}
      </div>

      <div 
        id="signature-canvas-wrapper" 
        className="w-full h-36 bg-stone-900 rounded-xl relative border border-stone-800 overflow-hidden shadow-inner cursor-crosshair group"
      >
        <canvas
          id="signature-pad-canvas"
          ref={canvasRef}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
          className="w-full h-full block"
        />

        {/* Floating guidance hint when unsigned */}
        {!hasSigned && (
          <div className="absolute inset-x-0 bottom-3 text-center pointer-events-none select-none text-stone-500 text-xs font-sans">
            เขียนชื่อย่อหรือเซ็นลายมือลงบนพื้นที่ว่างด้านบน
          </div>
        )}

        {/* Signed status indicator bottom right */}
        {hasSigned && (
          <div className="absolute bottom-2 right-2 flex items-center gap-1 text-[10px] uppercase font-sans text-emerald-500 font-semibold select-none bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-500/20">
            <CheckCircle2 size={10} /> Certified Signed
          </div>
        )}
      </div>
    </div>
  );
}
