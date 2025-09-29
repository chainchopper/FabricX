export type InputEventType = "tap" | "drag" | "long-press";

export interface InputEvent {
  type: InputEventType;
  // Normalized local coordinates within the canvas (0..1)
  x: number;
  y: number;
  t: number; // timestamp (ms)
}

type Listener = (e: InputEvent) => void;

class EventBus {
  private listeners: Set<Listener> = new Set();

  emit(e: InputEvent) {
    this.listeners.forEach((l) => l(e));
  }

  on(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  emitTap(x: number, y: number) {
    this.emit({ type: "tap", x, y, t: Date.now() });
  }

  emitDrag(x: number, y: number) {
    this.emit({ type: "drag", x, y, t: Date.now() });
  }

  emitLongPress(x: number, y: number) {
    this.emit({ type: "long-press", x, y, t: Date.now() });
  }
}

export const eventBus = new EventBus();