/** What a server action reports back to the form that called it. */
export type FormState = {
  ok: boolean;
  message?: string;
  errors?: Record<string, string | undefined>;
} | null;
