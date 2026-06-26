"use client";
// ============================================================================
// Global carousel wheel-scroll. Mounted once. Makes ANY horizontal-only
// scroller (carousel / row strip) respond to the regular mouse wheel, so users
// can move carousels with the wheel as well as the arrow buttons — everywhere.
// Only hijacks the wheel for elements that scroll horizontally but NOT
// vertically (i.e. true carousels), so page/2-D scrolling is never affected.
// ============================================================================
import { useEffect } from "react";

export function CarouselWheelScroll() {
  useEffect(() => {
    function onWheel(e: WheelEvent) {
      // Native horizontal intent (trackpad / shift+wheel) already works.
      if (e.deltaY === 0 || e.shiftKey || e.ctrlKey) return;

      let el = e.target as HTMLElement | null;
      while (el && el !== document.body) {
        if (el.scrollWidth > el.clientWidth + 1) {
          const ox = getComputedStyle(el).overflowX;
          const horizontal = ox === "auto" || ox === "scroll";
          const vertical = el.scrollHeight > el.clientHeight + 1;
          if (horizontal && !vertical) {
            const atStart = el.scrollLeft <= 0;
            const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1;
            // Let the page scroll when we're already at an edge and pushing past it.
            if (!((atStart && e.deltaY < 0) || (atEnd && e.deltaY > 0))) {
              el.scrollLeft += e.deltaY;
              e.preventDefault();
            }
            return;
          }
        }
        el = el.parentElement;
      }
    }
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => window.removeEventListener("wheel", onWheel);
  }, []);

  return null;
}
