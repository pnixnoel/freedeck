import { useCallback, useRef } from "react";

type MapFn = (clientX: number, clientY: number, rect: DOMRect) => number;

export function usePointerValue(
  value: number,
  onChange: (v: number) => void,
  mapPointer: MapFn,
) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const update = useCallback(
    (clientX: number, clientY: number) => {
      const el = trackRef.current;
      if (!el) return;
      onChange(mapPointer(clientX, clientY, el.getBoundingClientRect()));
    },
    [onChange, mapPointer],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      dragging.current = true;
      update(e.clientX, e.clientY);
    },
    [update],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging.current) return;
      update(e.clientX, e.clientY);
    },
    [update],
  );

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    dragging.current = false;
    e.currentTarget.releasePointerCapture(e.pointerId);
  }, []);

  return { trackRef, onPointerDown, onPointerMove, onPointerUp, value };
}
