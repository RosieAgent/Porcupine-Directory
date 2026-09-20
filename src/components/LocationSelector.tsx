import { Autocomplete, TextField } from "@mui/material";
import {
  findLocation,
  locationChoices,
  locationMatchKey,
} from "../../shared/locations";

export function LocationSelector({
  value,
  onChange,
  onBlur,
  error,
  helperText,
  label = "Town or region",
  legacy = [],
}: {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  error?: boolean;
  helperText?: string;
  label?: string;
  legacy?: string[];
}) {
  const options = locationChoices(legacy);
  const selected =
    findLocation(value) ??
    options.find(
      (option) => locationMatchKey(option.label) === locationMatchKey(value),
    ) ??
    null;
  return (
    <Autocomplete
      options={options}
      groupBy={(option) => option.group}
      getOptionLabel={(option) => option.label}
      isOptionEqualToValue={(option, other) => option.id === other.id}
      value={selected}
      autoHighlight
      onChange={(_, option) => onChange(option?.label ?? "")}
      onBlur={onBlur}
      renderInput={(props) => (
        <TextField
          {...props}
          label={label}
          error={error}
          helperText={
            helperText ??
            "Search and select a place, region, county or New Hampshire. Leave blank if unknown."
          }
        />
      )}
    />
  );
}
