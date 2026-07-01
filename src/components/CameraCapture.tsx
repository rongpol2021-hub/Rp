import React, { useState, useRef, useEffect } from "react";
import { Camera, Image as ImageIcon, Video, RefreshCw, Check, AlertCircle } from "lucide-react";

interface CameraCaptureProps {
  onCapture: (base64Image: string) => void;
  savedImage?: string;
}

export default function CameraCapture({ onCapture, savedImage }: CameraCaptureProps) {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isActive, setIsActive] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(savedImage || null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Sync savedImage changes
  useEffect(() => {
    if (savedImage) {
      setCapturedImage(savedImage);
    } else if (savedImage === undefined && !isActive) {
      setCapturedImage(null);
    }
  }, [savedImage, isActive]);

  // Request list of video inputs
  const getCameraDevices = async () => {
    try {
      const allDevices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = allDevices.filter(device => device.kind === "videoinput");
      setDevices(videoDevices);
      if (videoDevices.length > 0 && !selectedDeviceId) {
        setSelectedDeviceId(videoDevices[0].deviceId);
      }
    } catch (e) {
      console.error("Error reading camera devices", e);
    }
  };

  const startCamera = async (deviceId?: string) => {
    setPermissionError(null);
    setIsActive(true);
    setCapturedImage(null);

    // Stop current stream if any
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }

    try {
      const constraints: MediaStreamConstraints = {
        video: deviceId ? { deviceId: { exact: deviceId } } : { facingMode: "user" },
        audio: false
      };

      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
      // Get devices inside the permission scope as names will now be populated
      await getCameraDevices();
    } catch (err: any) {
      console.error("Camera access failed", err);
      setPermissionError(
        err.name === "NotAllowedError" || err.name === "PermissionDeniedError"
          ? "ไม่ได้รับอนุญาตให้เข้าถึงกล้อง กรุณากดให้อนุญาตสิทธิ์กล้อง"
          : "ไม่สามารถเปิดกล้องได้ หรือตัวกล้องกำลังถูกใช้งานโดยแอปอื่น"
      );
      setIsActive(false);
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    setIsActive(false);
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");

      if (ctx) {
        // Downscale to a compact resolution (200x150)
        // This keeps the image sharp enough for evidence, saves Firestore storage,
        // and stays under Excel's cell character limit of 32,767 characters!
        canvas.width = 200;
        canvas.height = 150;

        // Draw video frame resized to canvas
        ctx.drawImage(video, 0, 0, 200, 150);

        // Convert to Base64 with high compression quality (0.5)
        const dataUrl = canvas.toDataURL("image/jpeg", 0.5);
        setCapturedImage(dataUrl);
        onCapture(dataUrl);
        stopCamera();
      }
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d");
          if (ctx) {
            // Downscale to a compact resolution (200x150)
            canvas.width = 200;
            canvas.height = 150;
            ctx.drawImage(img, 0, 0, 200, 150);
            
            // Convert to Base64 with high compression quality (0.5)
            const compressedBase64 = canvas.toDataURL("image/jpeg", 0.5);
            setCapturedImage(compressedBase64);
            onCapture(compressedBase64);
          }
        };
        img.src = reader.result as string;
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDeviceChange = (deviceId: string) => {
    setSelectedDeviceId(deviceId);
    if (isActive) {
      startCamera(deviceId);
    }
  };

  // Clean stream on unmount
  useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [stream]);

  return (
    <div id="camera-capture-container" className="flex flex-col items-center w-full">
      <div 
        id="camera-preview-box" 
        className="relative w-full aspect-video md:max-w-md bg-stone-900 rounded-xl overflow-hidden shadow-inner border border-stone-800 flex flex-col items-center justify-center p-1"
      >
        {/* Stream View */}
        {isActive && (
          <video
            id="camera-live-video"
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover rounded-lg"
          />
        )}

        {/* Captured Preview */}
        {!isActive && capturedImage && (
          <img
            id="camera-captured-image"
            src={capturedImage}
            alt="Captured employee placeholder"
            className="w-full h-full object-cover rounded-lg"
            referrerPolicy="no-referrer"
          />
        )}

        {/* Inactive & No image state */}
        {!isActive && !capturedImage && (
          <div className="flex flex-col items-center justify-center text-center p-6 text-stone-400">
            <div className="w-16 h-16 rounded-full bg-stone-800/80 flex items-center justify-center mb-3 text-stone-300">
              <Camera size={28} className="animate-pulse" />
            </div>
            <p className="font-sans text-sm font-medium mb-1 text-stone-200">
              ถ่ายรูปผู้รับการตรวจแอลกอฮอล์
            </p>
            <p className="font-sans text-xs text-stone-500 max-w-xs">
              เพื่อเป็นหลักฐานยืนยันตัวตน ป้องกันการทดสอบแทนกัน
            </p>
          </div>
        )}

        {/* Loading overlay for starting camera */}
        {isActive && !stream && (
          <div className="absolute inset-0 bg-stone-950/90 flex flex-col items-center justify-center text-stone-300">
            <RefreshCw className="animate-spin text-stone-400 mb-2" size={24} />
            <span className="font-sans text-xs">กำลังเปิดกล้อง...</span>
          </div>
        )}

        {/* Grid overlay for live camera feedback */}
        {isActive && stream && (
          <div className="absolute inset-0 pointer-events-none border border-emerald-500/10 flex items-center justify-center">
            {/* Minimal guidelines overlay */}
            <div className="w-1/2 h-1/2 rounded-full border border-dashed border-emerald-500/20" />
            <div className="absolute top-2 right-2 bg-emerald-500/95 text-[10px] text-black font-sans px-2 py-0.5 rounded flex items-center gap-1 font-semibold animate-pulse shadow-md">
              <Video size={10} /> REC LIVE
            </div>
          </div>
        )}

        {/* Captured state banner */}
        {!isActive && capturedImage && (
          <div className="absolute bottom-2 left-2 bg-emerald-500 text-stone-950 font-sans text-xs px-2.5 py-1 rounded-md font-semibold flex items-center gap-1.5 shadow-lg">
            <Check size={14} strokeWidth={3} /> แนบรูปภาพแล้ว
          </div>
        )}
      </div>

      {/* Hidden storage canvas */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Permission Error Banner */}
      {permissionError && (
        <div id="camera-error-banner" className="mt-3 p-3 w-full md:max-w-md bg-rose-950/40 text-rose-300 rounded-lg text-xs flex gap-2 border border-rose-900/50">
          <AlertCircle className="shrink-0 text-rose-400" size={16} />
          <p className="font-sans">{permissionError}</p>
        </div>
      )}

      {/* Camera Controls */}
      <div id="camera-controls" className="mt-4 flex flex-wrap gap-2 justify-center w-full md:max-w-md">
        {!isActive ? (
          <>
            <button
              id="btn-open-camera"
              type="button"
              onClick={() => startCamera(selectedDeviceId)}
              className="flex-1 flex justify-center items-center gap-2 bg-stone-100 hover:bg-white text-stone-900 text-sm font-sans font-medium py-2.5 px-4 rounded-xl transition shadow-md hover:scale-[1.02]"
            >
              <Camera size={16} />
              {capturedImage ? "ถ่ายรูปภาพใหม่" : "เปิดกล้องเพื่อถ่ายภาพ"}
            </button>

            <label
              id="label-upload-image"
              className="flex-1 flex justify-center items-center gap-2 bg-stone-800 hover:bg-stone-700 text-stone-200 text-sm font-sans font-medium py-2.5 px-4 rounded-xl transition cursor-pointer border border-stone-700 shadow shadow-stone-900"
            >
              <ImageIcon size={16} />
              อัปโหลดไฟล์รูป
              <input
                id="input-camera-fallback-file"
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
          </>
        ) : (
          <div className="flex flex-col w-full gap-2">
            <div className="flex gap-2 w-full">
              <button
                id="btn-capture-photo"
                type="button"
                onClick={capturePhoto}
                disabled={!stream}
                className="flex-[2] flex justify-center items-center gap-2 bg-emerald-500 hover:bg-emerald-400 disabled:bg-emerald-800 disabled:text-emerald-300 text-stone-950 text-sm font-sans font-semibold py-3 px-4 rounded-xl transition shadow-md shadow-emerald-950/20"
              >
                <Check size={18} /> ถ่ายภาพ (Capture)
              </button>

              <button
                id="btn-cancel-camera"
                type="button"
                onClick={stopCamera}
                className="flex-1 flex justify-center items-center gap-2 bg-stone-800 hover:bg-stone-700 text-stone-200 text-sm font-sans font-medium py-3 px-3 rounded-xl transition border border-stone-700"
              >
                ยกเลิก
              </button>
            </div>

            {/* Select alternate camera if multiple available */}
            {devices.length > 1 && (
              <div className="flex items-center gap-2 text-stone-400 text-xs mt-1 w-full justify-between border-t border-stone-800 pt-2 px-1">
                <span className="font-sans font-medium text-stone-500">เลือกกล้อง:</span>
                <select
                  id="select-active-camera"
                  value={selectedDeviceId}
                  onChange={(e) => handleDeviceChange(e.target.value)}
                  className="bg-stone-800 border border-stone-700 text-stone-300 rounded px-2 py-1 max-w-[200px] outline-none font-sans"
                >
                  {devices.map((device, idx) => (
                    <option key={device.deviceId} value={device.deviceId}>
                      {device.label || `Camera ${idx + 1}`}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
