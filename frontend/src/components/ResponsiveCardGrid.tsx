import type { ReactNode } from "react";

export function ResponsiveCardGrid({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns:
          "repeat(auto-fill, minmax(min(220px, 100%), 1fr))",
        gap: "var(--mantine-spacing-md)",
      }}
    >
      {children}
    </div>
  );
}
