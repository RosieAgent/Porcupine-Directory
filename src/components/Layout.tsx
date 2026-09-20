import { useEffect, useRef, useState } from "react";
import {
  AppBar,
  Box,
  Button,
  Container,
  Divider,
  Drawer,
  List,
  ListItemButton,
  ListItemText,
  Stack,
  TextField,
  Toolbar,
  Typography,
} from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";
import SearchIcon from "@mui/icons-material/Search";
import { IconAction } from "./IconAction";
import { HeaderAccountActions } from "./HeaderAccountActions";
import {
  Form,
  Link,
  Outlet,
  ScrollRestoration,
  useLocation,
} from "react-router";

const navigation = [
  ["Explore", "/directory"],
  ["Browse tags", "/tags"],
  ["Businesses", "/directory?tag=Business"],
  ["Nonprofits", "/directory?tag=Nonprofit"],
  ["Signal connections", "/directory?connection=signal"],
  ["Events", "/events"],
  ["Saved", "/saved"],
  ["Add an entry", "/submit"],
  ["Donate", "/donate"],
  ["Sources, ranking & privacy", "/about"],
] as const;
export function Layout() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const main = useRef<HTMLElement>(null);
  useEffect(() => {
    main.current?.focus({ preventScroll: true });
  }, [location.pathname]);
  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <AppBar
        position="sticky"
        color="inherit"
        elevation={0}
        sx={{ borderBottom: 1, borderColor: "divider" }}
      >
        <Toolbar sx={{ gap: 2, flexWrap: "wrap", py: 1 }}>
          <Box sx={{ display: { md: "none" } }}>
            <IconAction label="Open navigation" onClick={() => setOpen(true)}>
              <MenuIcon />
            </IconAction>
          </Box>
          <Typography
            component={Link}
            to="/"
            sx={{
              textDecoration: "none",
              color: "primary.main",
              fontWeight: 600,
              lineHeight: 1.1,
            }}
          >
            PORCUPINE
            <Box
              component="span"
              sx={{ display: "block", letterSpacing: 3, fontSize: 10, mt: 0.5 }}
            >
              DIRECTORY
            </Box>
          </Typography>
          <Box
            component={Form}
            method="get"
            action="/directory"
            role="search"
            sx={{
              display: "flex",
              gap: 1,
              ml: "auto",
              width: { xs: "100%", sm: 360 },
              order: { xs: 4, sm: 3 },
            }}
          >
            <TextField name="q" label="Search the directory" fullWidth />
            <IconAction type="submit" label="Search">
              <SearchIcon />
            </IconAction>
          </Box>
          <Box sx={{ order: { xs: 3, sm: 4 }, ml: { xs: "auto", sm: 0 } }}>
            <HeaderAccountActions />
          </Box>
        </Toolbar>
      </AppBar>
      <Drawer open={open} onClose={() => setOpen(false)}>
        <Box
          sx={{ width: 270, pt: 2 }}
          role="navigation"
          aria-label="Mobile sections"
        >
          <Typography sx={{ px: 2, py: 1 }} variant="h3">
            Explore the community
          </Typography>
          <List>
            {navigation.map(([label, to]) => (
              <ListItemButton
                key={to}
                component={Link}
                to={to}
                onClick={() => setOpen(false)}
                sx={{
                  bgcolor:
                    location.pathname + location.search === to
                      ? "action.selected"
                      : undefined,
                }}
              >
                <ListItemText primary={label} />
              </ListItemButton>
            ))}
          </List>
        </Box>
      </Drawer>
      <Box sx={{ display: "flex", maxWidth: 1500, mx: "auto" }}>
        <Box
          component="nav"
          aria-label="Sections"
          sx={{
            width: 208,
            flexShrink: 0,
            display: { xs: "none", md: "block" },
            p: 2,
          }}
        >
          <Stack spacing={0.5} sx={{ position: "sticky", top: 98 }}>
            {navigation.map(([label, to]) => (
              <Button
                key={to}
                component={Link}
                to={to}
                sx={{
                  justifyContent: "flex-start",
                  bgcolor:
                    location.pathname + location.search === to
                      ? "action.selected"
                      : undefined,
                }}
              >
                {label}
              </Button>
            ))}
          </Stack>
        </Box>
        <Container
          component="main"
          id="main-content"
          ref={main}
          tabIndex={-1}
          sx={{
            py: { xs: 3, md: 4 },
            minWidth: 0,
            minHeight: "80vh",
            outline: 0,
          }}
        >
          <Outlet />
        </Container>
      </Box>
      <Divider />
      <Container component="footer" sx={{ py: 3 }}>
        <Typography variant="body2" color="text.secondary">
          Community information, without an account.{" "}
          <Link to="/about">Sources, ranking & privacy</Link>
        </Typography>
      </Container>
      <ScrollRestoration />
    </>
  );
}
