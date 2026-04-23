import {
  CheckIcon,
  Combobox,
  Group,
  Pill,
  PillsInput,
  Text,
  useCombobox,
} from "@mantine/core";
import { useResizeObserver } from "@mantine/hooks";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

const PILL_GAP = 4;

const MEASUREMENT_STYLE = {
  position: "absolute",
  top: -9999,
  left: -9999,
  visibility: "hidden",
  pointerEvents: "none",
  display: "flex",
  whiteSpace: "nowrap",
} as const;

interface Props<T extends string> {
  label?: string;
  placeholder?: string;
  value: T[];
  onChange: (value: T[]) => void;
  options: readonly T[];
  getLabel: (value: T) => string;
  /** Rendered between the check icon and the label in both pills and options. */
  renderAdornment?: (value: T) => ReactNode;
}

export function PillPicker<T extends string>({
  label,
  placeholder,
  value,
  onChange,
  options,
  getLabel,
  renderAdornment,
}: Props<T>) {
  const { t } = useTranslation();
  const combobox = useCombobox({
    onDropdownClose: () => combobox.resetSelectedOption(),
    onDropdownOpen: () => combobox.updateSelectedOptionIndex("active"),
  });

  const selected = new Set(value);

  const toggle = (v: T) => {
    onChange(selected.has(v) ? value.filter((x) => x !== v) : [...value, v]);
  };

  const remove = (v: T) => onChange(value.filter((x) => x !== v));

  const [rowRef, rowRect] = useResizeObserver<HTMLDivElement>();
  const measureRef = useRef<HTMLDivElement>(null);
  const overflowMeasureRef = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState(value.length);

  useLayoutEffect(() => {
    const measure = measureRef.current;
    const available = rowRect.width;
    if (!measure || available <= 0) return;

    const pillNodes = Array.from(measure.children) as HTMLElement[];
    if (pillNodes.length === 0) {
      setVisibleCount(0);
      return;
    }

    const widths = pillNodes.map((n) => n.offsetWidth);
    const totalAll = widths.reduce((s, w, i) => s + w + (i > 0 ? PILL_GAP : 0), 0);
    if (totalAll <= available) {
      setVisibleCount(widths.length);
      return;
    }

    const overflowWidth = overflowMeasureRef.current?.offsetWidth ?? 0;
    let used = overflowWidth + PILL_GAP;
    let count = 0;
    for (const w of widths) {
      const next = used + w + (count > 0 ? PILL_GAP : 0);
      if (next > available) break;
      used = next;
      count++;
    }
    setVisibleCount(count);
  }, [value, rowRect.width]);

  const renderPill = (v: T) => (
    <Pill
      key={v}
      withRemoveButton
      onRemove={() => remove(v)}
      removeButtonProps={{ "aria-label": t("common.remove") }}
      style={{ maxWidth: 140, flexShrink: 0 }}
    >
      <Group gap={6} wrap="nowrap" align="center">
        {renderAdornment?.(v)}
        <span
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {getLabel(v)}
        </span>
      </Group>
    </Pill>
  );

  const visible = value.slice(0, visibleCount);
  const overflow = value.length - visible.length;

  const pills = visible.map((v) => renderPill(v));

  if (overflow > 0) {
    pills.push(
      <Pill key="__overflow" style={{ flexShrink: 0 }}>
        {`+${overflow}`}
      </Pill>,
    );
  }

  const dropdownOptions = options.map((v) => (
    <Combobox.Option value={v} key={v} active={selected.has(v)}>
      <Group gap={8} wrap="nowrap">
        <CheckIcon
          size={10}
          style={{ visibility: selected.has(v) ? "visible" : "hidden" }}
        />
        {renderAdornment?.(v)}
        <Text size="sm">{getLabel(v)}</Text>
      </Group>
    </Combobox.Option>
  ));

  return (
    <Combobox
      store={combobox}
      onOptionSubmit={(val) => toggle(val as T)}
      withinPortal
    >
      <div aria-hidden style={MEASUREMENT_STYLE}>
        <div ref={measureRef} style={{ display: "flex", gap: PILL_GAP }}>
          {value.map(renderPill)}
        </div>
        <div ref={overflowMeasureRef}>
          <Pill style={{ flexShrink: 0 }}>{`+${Math.max(value.length, 1)}`}</Pill>
        </div>
      </div>
      <Combobox.DropdownTarget>
        <PillsInput label={label} onClick={() => combobox.openDropdown()}>
          <Pill.Group
            ref={rowRef}
            style={{ flexWrap: "nowrap", overflow: "hidden" }}
          >
            {pills}
            <Combobox.EventsTarget>
              <PillsInput.Field
                onFocus={() => combobox.openDropdown()}
                onBlur={() => combobox.closeDropdown()}
                onKeyDown={(e) => {
                  if (
                    e.key === "Backspace" &&
                    e.currentTarget.value === "" &&
                    value.length > 0
                  ) {
                    e.preventDefault();
                    remove(value[value.length - 1]);
                  }
                }}
                placeholder={value.length === 0 ? placeholder : ""}
                // Collapse the field so overflow pills are computed against
                // the actual remaining space, not a 60 px reservation.
                style={value.length > 0 ? { minWidth: 0, width: 0, flex: "1 1 0" } : undefined}
              />
            </Combobox.EventsTarget>
          </Pill.Group>
        </PillsInput>
      </Combobox.DropdownTarget>
      <Combobox.Dropdown>
        <Combobox.Options>{dropdownOptions}</Combobox.Options>
      </Combobox.Dropdown>
    </Combobox>
  );
}
