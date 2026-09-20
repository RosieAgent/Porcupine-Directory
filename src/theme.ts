import { createTheme } from "@mui/material/styles";
export const theme = createTheme({
  palette: {
    primary: { main: "#30513b" },
    secondary: { main: "#826127" },
    background: { default: "#f5f3ed", paper: "#fffefb" },
    text: { primary: "#203226", secondary: "#56665b" },
  },
  typography: {
    fontFamily: '"DM Sans", sans-serif',
    h1: {
      fontFamily: '"Fraunces", serif',
      fontSize: "2.8rem",
      fontWeight: 500,
    },
    h2: {
      fontFamily: '"Fraunces", serif',
      fontSize: "1.7rem",
      fontWeight: 500,
    },
    h3: { fontSize: "1.2rem", fontWeight: 600 },
    button: { textTransform: "none", fontWeight: 600 },
  },
  shape: { borderRadius: 10 },
  components: {
    MuiButton: { defaultProps: { disableElevation: true } },
    MuiIconButton: {
      styleOverrides: {
        root: {
          width: 44,
          height: 44,
          flexShrink: 0,
          "&[aria-current='page']": {
            backgroundColor: "#30513b",
            color: "#fffefb",
            "&:hover": { backgroundColor: "#203226" },
          },
        },
      },
    },
    MuiCard: { defaultProps: { variant: "outlined" } },
    MuiTextField: { defaultProps: { size: "small" } },
    MuiCssBaseline: {
      styleOverrides: {
        a: { overflowWrap: "anywhere" },
        "a.skip-link": {
          position: "absolute",
          top: -80,
          left: 16,
          zIndex: 2000,
          padding: 12,
          background: "white",
        },
        "a.skip-link:focus": { top: 8 },
      },
    },
  },
});
