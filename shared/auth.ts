import { z } from "zod";
export const usernameSchema = z
  .string()
  .max(256)
  .trim()
  .normalize("NFKC")
  .toLowerCase()
  .regex(
    /^[\p{L}\p{M}\p{N}\p{P}\p{S}]{3,32}$/u,
    "Use 3–32 visible characters. Letters, numbers and punctuation are welcome; spaces and invisible characters are not.",
  );
export const usernameHelp =
  "Private sign-in name: 3–32 characters, including punctuation such as . - @ + ! No spaces. Case-insensitive.";
export const passwordSchema = z
  .string()
  .min(15, "Use at least 15 characters.")
  .max(128);
// Form-only validation. Confirmation is never sent to the API or persisted.
export const confirmedPasswordSchema = z
  .object({
    password: passwordSchema,
    confirmation: z.string(),
  })
  .refine((value) => value.password === value.confirmation, {
    message: "Passwords do not match.",
    path: ["confirmation"],
  })
  .transform((value) => value.password);
export const signupSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
  alias: z.string().trim().max(80).default("Anonymous"),
  words: z.union([z.literal(12), z.literal(24)]).default(12),
});
export const loginSchema = z.object({
  username: usernameSchema,
  password: z.string().min(1).max(128),
});
export const recoverySchema = z.object({
  username: usernameSchema,
  phrase: z.string().max(500),
  password: passwordSchema,
});
export const accountSchema = z.object({
  id: z.uuid(),
  username: z.string(),
  alias: z.string(),
  role: z.enum(["user", "editor", "administrator"]),
  privilegesSuspended: z.boolean(),
  recoverySaved: z.boolean(),
  strong: z.boolean(),
  staffVerified: z.boolean().default(false),
  passkeyCount: z.number(),
});
export type Account = z.infer<typeof accountSchema>;
export const sessionSchema = z.object({
  user: accountSchema.nullable(),
  emailRecoveryEnabled: z.boolean(),
  passkeysEnabled: z.boolean().default(false),
  staffAuthMode: z
    .enum(["passkey", "password_recent", "session"])
    .default("passkey"),
  emailPreviewEnabled: z.boolean().default(false),
  submissionPolicy: z.enum(["published", "pending_review"]),
});
export const okSchema = z.object({ ok: z.literal(true) });
export const recoveryResponse = z.object({ phrase: z.string() });
export const activationSchema = z.object({
  token: z
    .string()
    .regex(
      /^[A-Za-z0-9_-]{43}$/,
      "Use the complete setup code from your invitation.",
    ),
  password: passwordSchema,
});
export const savedSchema = z.object({ ids: z.array(z.uuid()) });
export const savedTagsSchema = z.object({ ids: z.array(z.uuid()) });
