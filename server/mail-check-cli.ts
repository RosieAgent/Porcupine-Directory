// Host diagnostic: checks SMTP TLS/authentication; never sends a message or logs credentials.
import {
  createMailTransport,
  emailRecoveryEnabled,
  emailPreviewEnabled,
} from "./routes/email.js";
import { pool } from "./db.js";
try {
  if (!emailRecoveryEnabled())
    throw new Error(
      "Set SMTP_HOST, SMTP_FROM and a persistent 64-hex EMAIL_ENCRYPTION_KEY in the project's private environment. SMTP_USER/SMTP_PASSWORD may also be required by your provider.",
    );
  const transport = createMailTransport();
  try {
    await transport.verify();
    console.log(
      emailPreviewEnabled()
        ? "Local preview SMTP check passed (private container network; no TLS). No email was sent. Use a test address in Account security; messages stay in the local preview inbox."
        : "SMTP TLS/authentication check passed. No email was sent. Verify delivery using your own recovery email in Account security.",
    );
  } finally {
    transport.close();
  }
} catch {
  console.error(
    emailRecoveryEnabled()
      ? "SMTP check failed. Check the host, port, TLS and credentials privately; no secrets were logged."
      : "Email recovery is not configured: SMTP_HOST, SMTP_FROM and EMAIL_ENCRYPTION_KEY are required. See docs/email-recovery.md.",
  );
  process.exitCode = 1;
} finally {
  await pool.end();
}
