import { SimpleGrid, Stack, Title } from "@mantine/core";
import { AmsBlock } from "./AmsBlock";
import { PrinterEmptyState } from "./PrinterEmptyState";
import { PrinterError } from "./PrinterError";
import type { Printer } from "../api";

export function PrinterBlock({ p }: { p: Printer }) {
  const multiSlot = p.ams_units.filter((a) => a.slots.length > 1);
  const singleSlot = p.ams_units.filter((a) => a.slots.length === 1);
  const distinctNozzles = new Set(
    p.ams_units.map((a) => a.nozzle_id).filter((id) => id != null),
  );
  const showNozzle = distinctNozzles.size > 1;

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
        <Stack gap={12}>
          {multiSlot.length > 0 && (
            <SimpleGrid cols={{ base: 1, lg: 2 }} spacing={12}>
              {multiSlot.map((ams) => (
                <AmsBlock key={ams.id} ams={ams} showNozzle={showNozzle} />
              ))}
            </SimpleGrid>
          )}
          {singleSlot.length > 0 && (
            <SimpleGrid cols={{ base: 2, sm: 4, lg: 8 }} spacing={12}>
              {singleSlot.map((ams) => (
                <AmsBlock key={ams.id} ams={ams} showNozzle={showNozzle} />
              ))}
            </SimpleGrid>
          )}
        </Stack>
      )}
    </Stack>
  );
}
