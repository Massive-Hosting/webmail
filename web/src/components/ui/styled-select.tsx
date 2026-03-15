/** Styled select dropdown using Radix UI Select */

import React, { useMemo } from "react";
import * as Select from "@radix-ui/react-select";
import { ChevronDown, Check } from "lucide-react";

const EMPTY_SENTINEL = "__empty__";

export interface SelectOption {
  value: string;
  label: string;
}

export interface StyledSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export const StyledSelect = React.memo(function StyledSelect({
  value,
  onValueChange,
  options,
  placeholder,
  disabled,
  className,
}: StyledSelectProps) {
  // Radix Select does not support empty string values, so we map them
  const mappedOptions = useMemo(
    () =>
      options.map((opt) => ({
        ...opt,
        value: opt.value === "" ? EMPTY_SENTINEL : opt.value,
      })),
    [options],
  );

  const internalValue = value === "" ? EMPTY_SENTINEL : value;

  const handleValueChange = (v: string) => {
    onValueChange(v === EMPTY_SENTINEL ? "" : v);
  };

  return (
    <Select.Root value={internalValue} onValueChange={handleValueChange} disabled={disabled}>
      <Select.Trigger
        className={`styled-select-trigger ${className ?? ""}`}
        aria-label={placeholder}
      >
        <Select.Value placeholder={placeholder} />
        <Select.Icon className="styled-select-icon">
          <ChevronDown size={14} />
        </Select.Icon>
      </Select.Trigger>

      <Select.Portal>
        <Select.Content
          className="styled-select-content"
          position="popper"
          sideOffset={4}
        >
          <Select.Viewport className="styled-select-viewport">
            {mappedOptions.map((opt) => (
              <Select.Item
                key={opt.value}
                value={opt.value}
                className="styled-select-item"
              >
                <Select.ItemText>{opt.label}</Select.ItemText>
                <Select.ItemIndicator className="styled-select-indicator">
                  <Check size={14} />
                </Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
});
