import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type React from "react";

export function useSortableItem(id: string) {
  const sortable = useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
    opacity: sortable.isDragging ? 0.6 : 1,
    position: "relative",
    zIndex: sortable.isDragging ? 2 : undefined,
  };
  return { ...sortable, style };
}
