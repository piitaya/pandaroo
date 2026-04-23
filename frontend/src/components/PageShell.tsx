import { Box } from "@mantine/core";
import type { ReactNode } from "react";

export function PageShell({ children }: { children: ReactNode }) {
  return (
    <Box
      style={{
        height: "100%",
        overflow: "auto",
        padding: "var(--mantine-spacing-md)",
      }}
    >
      {children}
    </Box>
  );
}
