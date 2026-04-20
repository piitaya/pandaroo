import { ActionIcon, Badge, Menu, Text, ThemeIcon } from "@mantine/core";
import {
  IconDots,
  IconPencil,
  IconTrash,
} from "@tabler/icons-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { ConfirmModal } from "../ConfirmModal";
import { useDeleteHistoryEvent } from "../../hooks";
import { EditManualModal } from "./EditManualModal";
import { formatAmsSlot, formatDateTime } from "./formatters";
import { pinMeta, SESSION_COLOR } from "./pinMeta";
import type { UsageModel, UsagePin } from "./useSpoolUsageModel";
import classes from "./Timeline.module.css";
import shared from "./shared.module.css";

interface TimelineProps {
  model: UsageModel;
}

const ROW_HEIGHT = 68;

export function Timeline({ model }: TimelineProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const deleteEvent = useDeleteHistoryEvent();
  const [editing, setEditing] = useState<UsagePin | null>(null);
  const [deleting, setDeleting] = useState<UsagePin | null>(null);

  const rows = useMemo(
    () =>
      [...model.pins].sort(
        (a, b) => b.t - a.t || b.event.id - a.event.id,
      ),
    [model.pins],
  );

  const { bands, totalHeight } = useMemo(() => {
    const indexByEventId = new Map<number, number>();
    rows.forEach((pin, i) => indexByEventId.set(pin.event.id, i));
    const iconY = (i: number) => i * ROW_HEIGHT + ROW_HEIGHT / 2;
    const bands = model.sessions
      .map((session) => {
        const startIdx = indexByEventId.get(session.startEvent.id);
        if (startIdx === undefined) return null;
        const endIdx = session.endEvent
          ? indexByEventId.get(session.endEvent.id)
          : undefined;
        const top = endIdx !== undefined ? iconY(endIdx) : 0;
        const bottom = iconY(startIdx);
        return {
          id: session.startEvent.id,
          top,
          height: Math.max(bottom - top, 6),
        };
      })
      .filter((b): b is NonNullable<typeof b> => b !== null);
    return { bands, totalHeight: rows.length * ROW_HEIGHT };
  }, [rows, model.sessions]);

  if (rows.length === 0) {
    return (
      <div className={classes.empty}>
        <Text size="sm" c="dimmed">
          {t("spool_detail.usage.empty_title")}
        </Text>
        <Text size="xs" c="dimmed" mt={4}>
          {t("spool_detail.usage.empty_hint")}
        </Text>
      </div>
    );
  }

  return (
    <div className={classes.root}>
      <div
        className={classes.railLayer}
        style={{ height: totalHeight }}
        aria-hidden="true"
      >
        <div className={classes.spine} />
        {bands.map((band) => (
          <div
            key={band.id}
            className={`${classes.band} ${shared.sessionStripe}`}
            style={{ top: band.top, height: band.height }}
          />
        ))}
      </div>

      {rows.map((pin) => (
        <div key={pin.event.id} className={classes.row}>
          <div className={classes.iconCell}>
            <PinIcon pin={pin} t={t} />
          </div>
          <PinContent pin={pin} t={t} locale={locale} />
          {pin.kind === "manual" ? (
            <ManualMenu
              t={t}
              onEdit={() => setEditing(pin)}
              onDelete={() => setDeleting(pin)}
            />
          ) : (
            <span />
          )}
        </div>
      ))}

      {editing && (
        <EditManualModal
          opened
          onClose={() => setEditing(null)}
          tagId={editing.event.tag_id}
          eventId={editing.event.id}
          initialRemain={editing.event.remain}
        />
      )}

      <ConfirmModal
        opened={deleting != null}
        onClose={() => setDeleting(null)}
        onConfirm={() => {
          if (!deleting) return;
          const event = deleting.event;
          deleteEvent.mutate(
            { tagId: event.tag_id, eventId: event.id },
            { onSettled: () => setDeleting(null) },
          );
        }}
        title={t("spool_detail.usage.manual.delete_title")}
        body={t("spool_detail.usage.manual.delete_body")}
        loading={deleteEvent.isPending}
      />
    </div>
  );
}

function ManualMenu({
  t,
  onEdit,
  onDelete,
}: {
  t: TFunction;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <Menu position="bottom-end" withinPortal>
      <Menu.Target>
        <ActionIcon
          variant="subtle"
          color="gray"
          size="sm"
          aria-label={t("spool_detail.usage.manual.menu_aria")}
        >
          <IconDots size={16} />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item leftSection={<IconPencil size={14} />} onClick={onEdit}>
          {t("spool_detail.usage.manual.edit")}
        </Menu.Item>
        <Menu.Item
          color="red"
          leftSection={<IconTrash size={14} />}
          onClick={onDelete}
        >
          {t("spool_detail.usage.manual.delete")}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}

function PinIcon({ pin, t }: { pin: UsagePin; t: TFunction }) {
  const meta = pinMeta(pin.kind, t);
  const Icon = meta.Icon;
  return (
    <ThemeIcon
      size={32}
      radius="xl"
      variant="light"
      color={meta.color}
      className={shared.icon}
      style={{ "--icon-color": `var(--mantine-color-${meta.color}-filled)` } as React.CSSProperties}
    >
      <Icon size={15} />
    </ThemeIcon>
  );
}

function PinContent({
  pin,
  t,
  locale,
}: {
  pin: UsagePin;
  t: TFunction;
  locale: string;
}) {
  const meta = pinMeta(pin.kind, t);
  const dateTime = formatDateTime(pin.t, locale);
  const showAmsChip =
    pin.kind === "enter" || pin.kind === "exit" || pin.kind === "ams_last";
  const chip =
    showAmsChip && pin.event.ams_id != null && pin.event.slot_id != null
      ? formatAmsSlot(t, pin.event.ams_id, pin.event.slot_id)
      : null;
  const remain = pin.event.remain;

  return (
    <div className={classes.content}>
      <div className={classes.line1}>
        <Text size="sm" fw={600}>
          {meta.title}
        </Text>
        {chip && (
          <Badge color={SESSION_COLOR} variant="light" size="sm" radius="sm">
            {chip}
          </Badge>
        )}
      </div>
      <Text size="xs" c="dimmed" ff="monospace" className={classes.line2}>
        <span>{dateTime}</span>
        {remain != null && (
          <>
            <span>·</span>
            <Text
              component="span"
              size="xs"
              fw={700}
              ff="monospace"
              c="var(--mantine-color-text)"
            >
              {remain}%
            </Text>
          </>
        )}
      </Text>
    </div>
  );
}
