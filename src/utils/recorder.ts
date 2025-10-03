export type Recorder = {
  stop: () => Promise<void>;
  isActive: () => boolean;
};

export function startCanvasRecording(canvas: HTMLCanvasElement, fps = 60): Recorder | null {
  if (typeof window === "undefined") return null;
  // captureStream is not supported on some browsers
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stream: MediaStream | null = (canvas as any).captureStream ? (canvas as any).captureStream(fps) : null;
  if (!stream) return null;

  const data: BlobPart[] = [];
  const mime = "video/webm;codecs=vp9,opus";
  let rec: MediaRecorder;
  try {
    rec = new MediaRecorder(stream, { mimeType: mime });
  } catch {
    try {
      rec = new MediaRecorder(stream);
    } catch {
      return null;
    }
  }

  let active = false;

  rec.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) data.push(e.data);
  };
  rec.onstart = () => {
    active = true;
  };
  rec.onstop = () => {
    active = false;
  };

  try { rec.start(); } catch { return null; }

  const stop = async () => {
    return new Promise<void>((resolve) => {
      try {
        rec.onstop = () => {
          active = false;
          const blob = new Blob(data, { type: "video/webm" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `fabric-recording-${Date.now()}.webm`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          resolve();
        };
        rec.stop();
      } catch {
        resolve();
      }
    });
  };

  return {
    stop,
    isActive: () => active,
  };
}