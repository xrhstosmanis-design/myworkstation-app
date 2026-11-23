import React, {useLayoutEffect, useRef} from "react";

export default function PosLayoutDivider({storeId, type, label}) {
  const divider = useRef(null);
  const drag = useRef(null);
  const storageKey = `mws-pos-width:${storeId}:${type}`;
  const property = `--pos-${type}-width`;
  const isRail = type === "categories";
  const min = isRail ? 64 : 15;
  const max = isRail ? 230 : 60;

  useLayoutEffect(() => {
    const node = divider.current.parentElement;
    try {
      const saved = window.localStorage.getItem(storageKey);
      if (saved !== null && Number(saved) >= min && Number(saved) <= max) {
        node.style.setProperty(property, `${Number(saved)}${isRail ? "px" : "%"}`);
      }
    } catch {}
    return () => node.style.removeProperty(property);
  }, [storageKey, property, isRail, min, max]);

  function setWidth(event, pixels) {
    const node = event.currentTarget.parentElement;
    const style = window.getComputedStyle(node);
    const available = node.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    if (available <= 0) return;
    const preferred = isRail ? pixels : 100 * pixels / available;
    const value = Math.round(Math.max(min, Math.min(max, preferred)));
    node.style.setProperty(property, `${value}${isRail ? "px" : "%"}`);
    try { window.localStorage.setItem(storageKey, String(value)); } catch {}
  }

  return (
    <div
      ref={divider}
      className="pos-layout-divider"
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      title={label}
      tabIndex={0}
      onPointerDown={event => {
        if (event.button !== 0 || drag.current) return;
        const parent = event.currentTarget.parentElement;
        const scale = parent.getBoundingClientRect().width / parent.offsetWidth || 1;
        const panel = event.currentTarget.previousElementSibling;
        drag.current = {
          id: event.pointerId,
          x: event.clientX,
          width: panel.offsetWidth || panel.getBoundingClientRect().width,
          scale,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={event => {
        const start = drag.current;
        if (start?.id !== event.pointerId) return;
        if (event.clientX === start.x && !start.moved) return;
        start.moved = true;
        setWidth(event, start.width + (event.clientX - start.x) / start.scale);
      }}
      onLostPointerCapture={() => { drag.current = null; }}
      onKeyDown={event => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        event.stopPropagation();
        const width = event.currentTarget.previousElementSibling.offsetWidth;
        setWidth(event, width + (event.key === "ArrowLeft" ? -16 : 16));
      }}
    />
  );
}
