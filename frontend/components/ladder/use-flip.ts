"use client";

import { useCallback, useLayoutEffect, useRef } from "react";

/**
 * FLIP animation for rank changes. Rows remember where they were on the last
 * commit and slide from there — this is the difference between "looks cool"
 * and "is a table".
 */
export function useFlip() {
  const nodes = useRef(new Map<string, HTMLElement>());
  const positions = useRef(new Map<string, number>());

  const register = useCallback(
    (key: string) => (node: HTMLElement | null) => {
      if (node) nodes.current.set(key, node);
      else nodes.current.delete(key);
    },
    [],
  );

  useLayoutEffect(() => {
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    nodes.current.forEach((node, key) => {
      const top = node.getBoundingClientRect().top;
      const previous = positions.current.get(key);
      if (!reduced && previous !== undefined && Math.abs(previous - top) > 1) {
        node.animate(
          [{ transform: `translateY(${previous - top}px)` }, { transform: "translateY(0)" }],
          { duration: 480, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
        );
      }
      positions.current.set(key, top);
    });
  });

  return register;
}
