import { TextField } from "@mui/material";

export function ConfirmPasswordField({
  password,
  value,
  onChange,
}: {
  password: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const mismatch = value.length > 0 && value !== password;
  return (
    <TextField
      label="Confirm password"
      name="passwordConfirmation"
      type="password"
      required
      autoComplete="new-password"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      error={mismatch}
      helperText={
        mismatch ? "Passwords do not match." : "Re-enter your new password."
      }
    />
  );
}
