import { Button, Stack } from "@mui/material";
import { Link } from "react-router";

const workspaces = [
  { to: "/admin", label: "Overview" },
  { to: "/admin/audit", label: "Site activity" },
  { to: "/admin/users", label: "People" },
  { to: "/admin/services", label: "Service accounts" },
  { to: "/admin/sources", label: "Source health" },
] as const;

export function AdminWorkspaceNav({ active }: { active: string }) {
  return (
    <Stack
      component="nav"
      aria-label="Admin workspaces"
      direction="row"
      spacing={1}
      useFlexGap
      sx={{ flexWrap: "wrap" }}
    >
      {workspaces.map((workspace) => {
        const selected = workspace.to === active;
        return (
          <Button
            key={workspace.to}
            component={Link}
            to={workspace.to}
            aria-current={selected ? "page" : undefined}
            variant={selected ? "contained" : "outlined"}
            size="small"
          >
            {workspace.label}
          </Button>
        );
      })}
    </Stack>
  );
}
