import { Stack, Title } from "@mantine/core";
import { AmsBlock } from "./AmsBlock";
import { PrinterEmptyState } from "./PrinterEmptyState";
import { PrinterError } from "./PrinterError";
import type { Printer } from "../api";

export function PrinterBlock({ p }: { p: Printer }) {
  return (
    <Stack gap="md">
      <Title order={4}>{p.name}</Title>
      {p.status.errorCode != null ? (
        <PrinterError
          errorCode={p.status.errorCode}
          message={p.status.lastError ?? ""}
        />
      ) : p.ams_units.length === 0 ? (
        <PrinterEmptyState />
      ) : (
        p.ams_units.map((ams) => <AmsBlock key={ams.id} ams={ams} />)
      )}
    </Stack>
  );
}
