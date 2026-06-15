import { useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { Button, ButtonGroup, Menu, MenuItem } from "@mui/material";
import { ArrowDropDown } from "@mui/icons-material";

export type FilePickerSplitButtonProps = {
  label: string;
  startIcon: ReactNode;
  disabled?: boolean;
  multiple?: boolean;
  defaultAccept: string;
  alternateAccept: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  menuLabels: { default: string; alternate: string; all: string };
  chooseTypeAriaLabel: string;
};

export function FilePickerSplitButton({
  label,
  startIcon,
  disabled,
  multiple,
  defaultAccept,
  alternateAccept,
  onChange,
  menuLabels,
  chooseTypeAriaLabel,
}: FilePickerSplitButtonProps) {
  const defaultRef = useRef<HTMLInputElement>(null);
  const altRef = useRef<HTMLInputElement>(null);
  const allRef = useRef<HTMLInputElement>(null);
  const [anchor, setAnchor] = useState<null | HTMLElement>(null);

  const openPicker = (ref: React.RefObject<HTMLInputElement | null>) => {
    setAnchor(null);
    ref.current?.click();
  };

  return (
    <>
      <ButtonGroup variant="outlined" disabled={disabled} sx={{ flexShrink: 0 }}>
        <Button
          startIcon={startIcon}
          size="medium"
          onClick={() => openPicker(defaultRef)}
          sx={{ minWidth: 200 }}
        >
          {label}
        </Button>
        <Button
          size="medium"
          aria-label={chooseTypeAriaLabel}
          onClick={(e) => setAnchor(e.currentTarget)}
          sx={{ px: 0.75 }}
        >
          <ArrowDropDown />
        </Button>
      </ButtonGroup>
      <input
        ref={defaultRef}
        type="file"
        accept={defaultAccept}
        multiple={multiple}
        hidden
        onChange={onChange}
      />
      <input
        ref={altRef}
        type="file"
        accept={alternateAccept}
        multiple={multiple}
        hidden
        onChange={onChange}
      />
      <input ref={allRef} type="file" multiple={multiple} hidden onChange={onChange} />
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
        <MenuItem onClick={() => openPicker(defaultRef)}>{menuLabels.default}</MenuItem>
        <MenuItem onClick={() => openPicker(altRef)}>{menuLabels.alternate}</MenuItem>
        <MenuItem onClick={() => openPicker(allRef)}>{menuLabels.all}</MenuItem>
      </Menu>
    </>
  );
}
