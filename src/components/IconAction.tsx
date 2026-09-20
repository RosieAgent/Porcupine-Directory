import type { ReactNode } from "react";
import { IconButton, Tooltip } from "@mui/material";
import type { IconButtonProps } from "@mui/material";
import { Link as RouterLink } from "react-router";

// MUI supplies focus/touch tooltips; the span supports disabled actions too.
export function IconAction({
  label,
  ...props
}: IconButtonProps & { label: string }) {
  return (
    <Tooltip title={label} describeChild>
      <span
        style={{
          display: "inline-flex",
          alignSelf: "flex-start",
          flexShrink: 0,
        }}
      >
        <IconButton color="primary" {...props} aria-label={label} />
      </span>
    </Tooltip>
  );
}
type IconLinkProps = {
  label: string;
  children: ReactNode;
  current?: boolean;
} & ({ to: string; href?: never } | { href: string; to?: never });
export function IconLink({
  label,
  children,
  current,
  ...destination
}: IconLinkProps) {
  const props = {
    "aria-label": label,
    "aria-current": current ? ("page" as const) : undefined,
    color: "primary" as const,
  };
  return (
    <Tooltip title={label} describeChild>
      {destination.to !== undefined ? (
        <IconButton {...props} component={RouterLink} to={destination.to}>
          {children}
        </IconButton>
      ) : (
        <IconButton
          {...props}
          href={destination.href}
          target="_blank"
          rel="noreferrer"
        >
          {children}
        </IconButton>
      )}
    </Tooltip>
  );
}
