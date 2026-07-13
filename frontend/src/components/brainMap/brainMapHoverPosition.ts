/** Clamp a hover card near the pointer without leaving the map container. */
export function computeHoverCardPosition(
  pointerX: number,
  pointerY: number,
  cardWidth: number,
  cardHeight: number,
  containerWidth: number,
  containerHeight: number,
  reservedRight = 0,
): { left: number; top: number } {
  const margin = 10;
  const offsetX = 20;
  const offsetY = 18;
  const maxLeft = containerWidth - cardWidth - margin - Math.max(0, reservedRight);

  let left = pointerX + offsetX;
  let top = pointerY - cardHeight - offsetY;

  if (left + cardWidth + margin > containerWidth - reservedRight) {
    left = pointerX - cardWidth - offsetX;
  }
  if (top < margin) {
    top = pointerY + offsetY;
  }

  left = Math.max(margin, Math.min(left, maxLeft));
  top = Math.max(margin, Math.min(top, containerHeight - cardHeight - margin));
  return { left, top };
}
