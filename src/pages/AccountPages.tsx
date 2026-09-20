import { useState } from "react";
import { EventSyncDiagnostics } from "../components/EventSyncDiagnostics";
import AddCircleOutline from "@mui/icons-material/AddCircleOutlineOutlined";
import Logout from "@mui/icons-material/Logout";
import { ConfirmPasswordField } from "../components/ConfirmPasswordField";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Alert,
  Button,
  Checkbox,
  FormControlLabel,
  MenuItem,
  Pagination,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router";
import Login from "@mui/icons-material/Login";
import PersonAddOutlined from "@mui/icons-material/PersonAddOutlined";
import KeyOutlined from "@mui/icons-material/KeyOutlined";
import Check from "@mui/icons-material/Check";
import Search from "@mui/icons-material/Search";
import SaveOutlined from "@mui/icons-material/SaveOutlined";
import LockResetOutlined from "@mui/icons-material/LockResetOutlined";
import { z } from "zod";
import { Page, Loading, ErrorState } from "../components/Page";
import { IconAction, IconLink } from "../components/IconAction";
import { useAuth } from "../state/AuthProvider";
import { mutate, request } from "../lib/api";
import { authenticatePasskey, registerPasskey } from "../lib/passkeys";
import {
  okSchema,
  recoveryResponse,
  signupSchema,
  loginSchema,
  recoverySchema,
  usernameHelp,
  confirmedPasswordSchema,
} from "../../shared/auth";
import { listingsResponse } from "../../shared/contracts";
import { ConfirmationBadges } from "../components/ConfirmationBadges";
import { StaffVerification } from "../components/StaffVerification";
import { AdminUsers } from "../components/AdminUsers";
import EditOutlined from "@mui/icons-material/EditOutlined";
import { EmailSettings } from "../components/EmailSettings";
import SendOutlined from "@mui/icons-material/SendOutlined";

export function RecoveryPhrase({
  phrase,
  onDone,
}: {
  phrase: string;
  onDone: () => void;
}) {
  const [saved, setSaved] = useState(false);
  const { refresh } = useAuth();
  const confirm = useMutation({
    mutationFn: async () => {
      await mutate("/auth/recovery/saved", okSchema);
      await refresh();
      onDone();
    },
  });
  return (
    <Paper variant="outlined" sx={{ p: 3, maxWidth: 720 }}>
      <Stack spacing={2}>
        <Typography variant="h2">Save your recovery phrase</Typography>
        <Alert severity="warning">
          Shown only now. Store it offline or in your password manager. Anyone
          with this phrase can reset your account. Never use a wallet seed or
          Nostr secret here.
        </Alert>
        <TextField
          label="Recovery phrase"
          value={phrase}
          multiline
          slotProps={{
            input: { readOnly: true },
            htmlInput: { spellCheck: false },
          }}
        />
        <Typography>
          Keep this phrase even if you add optional email recovery. Without a
          working sign-in or recovery method, your account cannot be recovered.
        </Typography>
        <FormControlLabel
          control={
            <Checkbox
              checked={saved}
              onChange={(_, value) => setSaved(value)}
            />
          }
          label="I have saved my recovery phrase somewhere safe"
        />
        {confirm.error && (
          <Alert severity="error">{confirm.error.message}</Alert>
        )}
        <IconAction
          label="Finish account setup"
          disabled={!saved || confirm.isPending}
          onClick={() => confirm.mutate()}
        >
          <Check />
        </IconAction>
      </Stack>
    </Paper>
  );
}
function SignIn({ mode }: { mode: "login" | "register" | "recover" }) {
  const navigate = useNavigate();
  const { refresh, emailRecoveryEnabled, passkeysEnabled } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [alias, setAlias] = useState("");
  const [phrase, setPhrase] = useState("");
  const [recoveryMethod, setRecoveryMethod] = useState("phrase");
  const [words, setWords] = useState<12 | 24>(12);
  const [newPhrase, setNewPhrase] = useState("");
  const submit = useMutation({
    mutationFn: async () => {
      if (mode === "login")
        await mutate(
          "/auth/login",
          okSchema,
          loginSchema.parse({ username, password }),
        );
      else {
        confirmedPasswordSchema.parse({ password, confirmation });
        const response = await mutate(
          mode === "register"
            ? "/auth/signup"
            : recoveryMethod === "email"
              ? "/auth/email/recover"
              : "/auth/recover",
          recoveryResponse,
          mode === "register"
            ? signupSchema.parse({ username, password, alias, words })
            : recoveryMethod === "email"
              ? { username, password, code: phrase }
              : recoverySchema.parse({ username, password, phrase }),
        );
        setNewPhrase(response.phrase);
      }
      setPassword("");
      setConfirmation("");
      setPhrase("");
      await refresh();
      if (mode === "login") navigate("/account");
    },
  });
  const passkey = useMutation({
    mutationFn: async () => {
      await authenticatePasskey();
      await refresh();
      navigate("/account");
    },
  });
  const sendCode = useMutation({
    mutationFn: () => mutate("/auth/email/request", okSchema, { username }),
  });
  const title =
    mode === "login"
      ? "Sign in"
      : mode === "register"
        ? "Create a private account"
        : "Recover your account";
  return (
    <Page
      title={title}
      description="No account is needed to explore the directory or submit an entry."
    >
      {newPhrase ? (
        <RecoveryPhrase
          phrase={newPhrase}
          onDone={() => {
            setNewPhrase("");
            navigate("/account");
          }}
        />
      ) : (
        <Paper
          component="form"
          variant="outlined"
          sx={{ p: 3, maxWidth: 560 }}
          onSubmit={(event) => {
            event.preventDefault();
            submit.mutate();
          }}
        >
          <Stack spacing={2}>
            <TextField
              label="Username"
              required
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              error={
                submit.error instanceof z.ZodError &&
                submit.error.issues.some(
                  (issue) => issue.path[0] === "username",
                )
              }
              helperText={
                submit.error instanceof z.ZodError
                  ? (submit.error.issues.find(
                      (issue) => issue.path[0] === "username",
                    )?.message ?? usernameHelp)
                  : usernameHelp
              }
            />
            {mode === "register" && (
              <TextField
                label="Display alias (optional)"
                value={alias}
                onChange={(e) => setAlias(e.target.value)}
                helperText="Defaults to Anonymous. Entry ownership is private."
              />
            )}
            {mode === "recover" && (
              <>
                <Alert severity="warning">
                  Recovery resets your credentials, signs out every device, and
                  suspends editor/admin access until reapproved.
                </Alert>
                {emailRecoveryEnabled && (
                  <TextField
                    select
                    label="Recovery method"
                    value={recoveryMethod}
                    onChange={(e) => {
                      setRecoveryMethod(e.target.value);
                      setPhrase("");
                    }}
                  >
                    <MenuItem value="phrase">
                      Recovery phrase (recommended)
                    </MenuItem>
                    <MenuItem value="email">Verified email</MenuItem>
                  </TextField>
                )}
                {recoveryMethod === "email" && (
                  <>
                    <IconAction
                      label="Send recovery email"
                      disabled={sendCode.isPending || !username}
                      onClick={() => sendCode.mutate()}
                    >
                      <SendOutlined />
                    </IconAction>
                    {sendCode.isSuccess && (
                      <Alert severity="info">
                        If this account has a verified recovery email, a code
                        has been sent.
                      </Alert>
                    )}
                    {sendCode.error && (
                      <Alert severity="error">{sendCode.error.message}</Alert>
                    )}
                  </>
                )}
                <TextField
                  label={
                    recoveryMethod === "email"
                      ? "Email recovery code"
                      : "Recovery phrase"
                  }
                  required
                  multiline
                  value={phrase}
                  onChange={(e) => setPhrase(e.target.value)}
                  autoComplete="off"
                  slotProps={{ htmlInput: { spellCheck: false } }}
                />
              </>
            )}
            <TextField
              label={mode === "recover" ? "New password" : "Password"}
              required
              type="password"
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              error={
                submit.error instanceof z.ZodError &&
                submit.error.issues.some(
                  (issue) => issue.path[0] === "password",
                )
              }
              helperText={
                (submit.error instanceof z.ZodError
                  ? submit.error.issues.find(
                      (issue) => issue.path[0] === "password",
                    )?.message
                  : undefined) ??
                (mode !== "login"
                  ? "At least 15 characters. A long, unique passphrase works well."
                  : undefined)
              }
            />
            {mode !== "login" && (
              <ConfirmPasswordField
                password={password}
                value={confirmation}
                onChange={setConfirmation}
              />
            )}
            {mode === "register" && (
              <>
                <TextField
                  select
                  label="Recovery phrase length"
                  value={words}
                  onChange={(e) => setWords(Number(e.target.value) as 12 | 24)}
                >
                  <MenuItem value={12}>12 words</MenuItem>
                  <MenuItem value={24}>24 words</MenuItem>
                </TextField>
                <Typography variant="body2">
                  We store password/recovery verifiers, not the secrets
                  themselves.{" "}
                  {emailRecoveryEnabled
                    ? "You can add an optional recovery email in Account security after signing up."
                    : "Optional email recovery is not configured on this installation."}
                </Typography>
              </>
            )}
            {submit.error && (
              <Alert severity="error">
                {submit.error instanceof z.ZodError
                  ? submit.error.issues[0].message
                  : submit.error.message}
              </Alert>
            )}
            <Stack
              direction="row"
              spacing={1}
              useFlexGap
              sx={{ alignItems: "center", flexWrap: "wrap" }}
              aria-label="Account actions"
            >
              <IconAction
                type="submit"
                label={title}
                loading={submit.isPending}
                disabled={submit.isPending}
              >
                {mode === "login" ? (
                  <Login />
                ) : mode === "register" ? (
                  <PersonAddOutlined />
                ) : (
                  <LockResetOutlined />
                )}
              </IconAction>
              {mode === "login" && passkeysEnabled && (
                <>
                  <IconAction
                    label="Sign in with a passkey"
                    onClick={() => passkey.mutate()}
                    disabled={passkey.isPending}
                  >
                    <KeyOutlined />
                  </IconAction>
                </>
              )}
              {mode !== "login" && (
                <IconLink to="/login" label="Sign in">
                  <Login />
                </IconLink>
              )}
              {mode !== "register" && (
                <IconLink to="/register" label="Create account">
                  <PersonAddOutlined />
                </IconLink>
              )}
              {mode !== "recover" && (
                <IconLink to="/recover" label="Recover account">
                  <LockResetOutlined />
                </IconLink>
              )}
            </Stack>
            {passkey.error && (
              <Alert severity="error">{passkey.error.message}</Alert>
            )}
          </Stack>
        </Paper>
      )}
    </Page>
  );
}
function AccountHome() {
  const { user, passkeysEnabled } = useAuth();
  return (
    <Page title="Your account" description={`${user!.alias} · ${user!.role}`}>
      <Typography>
        Private username: {user!.username}. Your account ownership and saved
        entries are not shown to other users.
      </Typography>
      {!user!.recoverySaved && (
        <Alert severity="warning">
          Your recovery phrase has not been marked saved. If you lost it, rotate
          it in Account security.
        </Alert>
      )}
      {user!.privilegesSuspended && (
        <Alert severity="warning">
          Elevated privileges are suspended.{" "}
          {passkeysEnabled ? "Register a new passkey and save" : "Save"} your
          recovery phrase, then ask an administrator to reapprove your editor
          role. Administrators must use the host console.
        </Alert>
      )}
      <Stack direction="row" spacing={2} sx={{ flexWrap: "wrap" }}>
        <Button component={Link} to="/account/security">
          Account security
        </Button>
        <Button component={Link} to="/account/entries">
          My entries
        </Button>
        <Button component={Link} to="/account/assignments">
          Ownership invitations
        </Button>
        <Button component={Link} to="/saved">
          Saved entries
        </Button>
        {user!.role !== "user" && (
          <Button component={Link} to="/editor/review">
            Review queue
          </Button>
        )}
        {user!.role !== "user" && (
          <Button component={Link} to="/editor/tags">
            Manage tags
          </Button>
        )}
        {user!.role !== "user" && (
          <Button component={Link} to="/editor">
            Editor workspace
          </Button>
        )}
        {user!.role === "administrator" && (
          <Button component={Link} to="/admin">
            Administration
          </Button>
        )}
      </Stack>
    </Page>
  );
}
function Security() {
  const { user, refresh, passkeysEnabled } = useAuth();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [phrase, setPhrase] = useState("");
  const action = useMutation({
    mutationFn: async (kind: "register" | "verify" | "rotate" | "revoke") => {
      if (kind === "register") await registerPasskey();
      if (kind === "verify") await authenticatePasskey();
      if (kind === "rotate") {
        confirmedPasswordSchema.parse({ password, confirmation });
        const data = await mutate("/auth/security/reset", recoveryResponse, {
          password,
        });
        setPhrase(data.phrase);
        setPassword("");
        setConfirmation("");
      }
      if (kind === "revoke") await mutate("/auth/sessions/revoke", okSchema);
      await refresh();
    },
  });
  return (
    <Page
      title="Account security"
      parent={{ label: "Your account", to: "/account" }}
    >
      {phrase ? (
        <RecoveryPhrase phrase={phrase} onDone={() => setPhrase("")} />
      ) : (
        <Stack spacing={3} sx={{ maxWidth: 720 }}>
          <StaffVerification />
          {passkeysEnabled && (
            <Typography>
              {user!.passkeyCount} passkey(s) registered.{" "}
              {user!.strong
                ? "Passkey verified for privileged actions."
                : "Editors and administrators must verify a passkey before privileged actions."}
            </Typography>
          )}
          <Alert severity="info">
            {passkeysEnabled &&
              "Passkeys work on HTTPS or localhost. Add a second passkey on another device as a backup. "}
            Before changing security settings, sign in again (within five
            minutes).
          </Alert>
          {passkeysEnabled && (
            <Stack direction="row" spacing={2}>
              <IconAction
                label="Add a passkey"
                onClick={() => action.mutate("register")}
                disabled={action.isPending}
              >
                <KeyOutlined />
              </IconAction>
              <IconAction
                label="Verify with your passkey"
                onClick={() => action.mutate("verify")}
                disabled={action.isPending}
              >
                <Check />
              </IconAction>
            </Stack>
          )}
          <Paper
            component="form"
            variant="outlined"
            sx={{ p: 3 }}
            onSubmit={(e) => {
              e.preventDefault();
              action.mutate("rotate");
            }}
          >
            <Stack spacing={2}>
              <Typography variant="h2">
                Replace password and recovery phrase
              </Typography>
              <Typography>
                Signs out other sessions and invalidates your previous recovery
                phrase. {passkeysEnabled && "Existing passkeys remain usable."}
              </Typography>
              <TextField
                label="New password"
                type="password"
                required
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <ConfirmPasswordField
                password={password}
                value={confirmation}
                onChange={setConfirmation}
              />
              <IconAction
                label="Replace password and recovery phrase"
                type="submit"
                disabled={action.isPending || password.length < 15}
              >
                <LockResetOutlined />
              </IconAction>
            </Stack>
          </Paper>
          <IconAction
            label="Sign out all devices, including this one"
            disabled={action.isPending}
            onClick={() => {
              if (window.confirm("Sign out every device, including this one?"))
                action.mutate("revoke");
            }}
          >
            <Logout />
          </IconAction>
          <EmailSettings />
          {action.isSuccess && (
            <Alert severity="success">Security settings updated.</Alert>
          )}
          {action.error && (
            <Alert severity="error">
              {action.error instanceof z.ZodError
                ? action.error.issues[0].message
                : action.error.message}
            </Alert>
          )}
        </Stack>
      )}
    </Page>
  );
}
function Entries({ all }: { all: boolean }) {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Math.min(10000, Number(params.get("page")) || 1));
  const result = useQuery({
    queryKey: ["private", "entries", user!.id, all, page],
    queryFn: () =>
      request(`/listings/manage?all=${all}&page=${page}`, listingsResponse),
  });
  return (
    <Page
      title={all ? "Editor workspace" : "My entries"}
      description={
        all
          ? "Global editor access for v0.1. Confirmation, review and publication are separate actions."
          : "Entries you created or accepted ownership of appear here."
      }
    >
      {all && <StaffVerification />}
      {all && (
        <Stack direction="row" spacing={2} sx={{ flexWrap: "wrap" }}>
          <Button component={Link} to="/editor/review">
            Review queue
          </Button>
          <Button component={Link} to="/editor/tags">
            Manage tags
          </Button>
        </Stack>
      )}
      {!all && (
        <Stack direction="row" sx={{ justifyContent: "flex-end" }}>
          <IconLink label="Create entry" to="/submit">
            <AddCircleOutline />
          </IconLink>
        </Stack>
      )}
      {result.isPending ? (
        <Loading />
      ) : result.error ? (
        <ErrorState error={result.error} />
      ) : (
        <>
          <Typography>{result.data.total} entries</Typography>
          {result.data.items.map((entry) => (
            <Paper key={entry.id} variant="outlined" sx={{ p: 2 }}>
              <Stack
                direction="row"
                spacing={2}
                sx={{ alignItems: "center", justifyContent: "space-between" }}
              >
                <Stack>
                  <Typography>{entry.name}</Typography>
                  <Typography variant="caption">
                    {entry.status === "published"
                      ? "Published"
                      : entry.status === "archived"
                        ? "Hidden"
                        : "Pending publication"}{" "}
                    · revision {entry.version}
                  </Typography>
                  <ConfirmationBadges listing={entry} />
                </Stack>
                <IconLink
                  label={"Edit " + entry.name}
                  to={`/listings/${entry.id}/edit`}
                >
                  <EditOutlined />
                </IconLink>
              </Stack>
            </Paper>
          ))}
          <Pagination
            count={Math.ceil(result.data.total / 24)}
            page={page}
            onChange={(_, value) => setParams({ page: String(value) })}
          />
        </>
      )}
    </Page>
  );
}
function Administration() {
  const { passkeysEnabled, staffAuthMode, refresh } = useAuth();
  const [username, setUsername] = useState("");
  const [role, setRole] = useState<"user" | "editor">("editor");
  const lookup = useMutation({
    mutationFn: () =>
      request(
        "/admin/account?username=" + encodeURIComponent(username),
        z.object({
          username: z.string(),
          role: z.string(),
          privilegesSuspended: z.boolean(),
          passkeyCount: z.number(),
        }),
      ),
  });
  const assign = useMutation({
    mutationFn: () => mutate("/admin/role", okSchema, { username, role }),
    onSuccess: async () => {
      await refresh();
      lookup.mutate();
    },
  });
  return (
    <Page
      title="Administration"
      description={
        staffAuthMode === "passkey" && passkeysEnabled
          ? "Assign global editors by their private username. Users must register a passkey and save their recovery phrase first."
          : "Manage accounts and assign global editors. Recipients must save their recovery phrase first."
      }
    >
      <StaffVerification />
      <AdminUsers
        onSelect={(value) => {
          setUsername(value);
          lookup.reset();
          assign.reset();
        }}
      />
      <Paper variant="outlined" sx={{ p: 3, maxWidth: 650 }}>
        <Stack spacing={2}>
          <TextField
            label="Exact username"
            value={username}
            onChange={(e) => {
              setUsername(e.target.value);
              lookup.reset();
              assign.reset();
            }}
          />
          <IconAction
            label="Find account"
            disabled={lookup.isPending}
            onClick={() => lookup.mutate()}
          >
            <Search />
          </IconAction>
          {lookup.data && (
            <>
              <Typography>
                {lookup.data.username} · {lookup.data.role} ·{" "}
                {passkeysEnabled && `${lookup.data.passkeyCount} passkey(s)`}
                {lookup.data.privilegesSuspended
                  ? " · privileges suspended"
                  : ""}
              </Typography>
              <TextField
                select
                label="Role"
                value={role}
                onChange={(e) => setRole(e.target.value as "user" | "editor")}
              >
                <MenuItem value="user">User (remove editor access)</MenuItem>
                <MenuItem value="editor">Editor (global access)</MenuItem>
              </TextField>
              <IconAction
                label="Assign role"
                disabled={assign.isPending}
                onClick={() => {
                  if (
                    window.confirm(
                      `Assign ${role} access to ${username}? This signs them out.`,
                    )
                  )
                    assign.mutate();
                }}
              >
                <SaveOutlined />
              </IconAction>
            </>
          )}
          {(lookup.error || assign.error) && (
            <Alert severity="error">
              {(lookup.error || assign.error)?.message}
            </Alert>
          )}
          {assign.isSuccess && (
            <Alert severity="success">
              Role updated. The user must sign in again.
            </Alert>
          )}
        </Stack>
      </Paper>
      <EventSyncDiagnostics />
    </Page>
  );
}
export default function AccountPages() {
  const { pathname } = useLocation();
  const { user, loading, error } = useAuth();
  if (["/login", "/register", "/recover"].includes(pathname))
    return (
      <SignIn
        key={pathname}
        mode={pathname.slice(1) as "login" | "register" | "recover"}
      />
    );
  if (loading) return <Loading />;
  if (error)
    return (
      <Page title="Account unavailable">
        <ErrorState error={error} />
      </Page>
    );
  if (!user)
    return (
      <Page title="Sign in to continue">
        <Button component={Link} to="/login">
          Sign in
        </Button>
        <Typography>
          Browsing and anonymous submissions remain available without an
          account.
        </Typography>
      </Page>
    );
  if (pathname === "/account/security") return <Security />;
  if (pathname === "/account/entries" || pathname === "/editor")
    return <Entries all={pathname === "/editor"} />;
  if (pathname === "/admin")
    return user.role === "administrator" ? (
      <Administration />
    ) : (
      <Page title="Administrator access required">
        <Typography>This page is restricted to administrators.</Typography>
      </Page>
    );
  return <AccountHome />;
}
