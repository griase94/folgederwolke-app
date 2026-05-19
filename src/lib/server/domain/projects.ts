/**
 * Server-only Projekte domain helpers.
 *
 * - validateAddProject / validateEditProject: Zod schemas + validation
 *
 * ProjectView is the serializable shape returned to the client.
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// View type (serializable — no Date objects)
// ---------------------------------------------------------------------------

export type ProjectView = {
  id: string;
  businessId: string;
  name: string;
  sphereDefault: string | null;
  startDate: string | null;
  endDate: string | null;
  notes: string | null;
  isFixture: boolean;
  deletedAt: string | null;
  createdAt: string;
};

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

function optionalText(schema: z.ZodString) {
  return z
    .string()
    .optional()
    .transform((v) => (v === "" ? undefined : v))
    .pipe(z.union([schema, z.undefined()]));
}

const sphereValues = [
  "ideeller",
  "vermoegen",
  "zweckbetrieb",
  "wirtschaftlich",
] as const;

const projectBaseSchema = z.object({
  name: z
    .string()
    .min(1, "Projektname ist erforderlich")
    .max(200, "Projektname zu lang"),
  sphere_default: z
    .enum(sphereValues)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  start_date: optionalText(
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Datum im Format JJJJ-MM-TT"),
  ),
  end_date: optionalText(
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Datum im Format JJJJ-MM-TT"),
  ),
  notes: optionalText(z.string().max(2000, "Notizen zu lang")),
});

export const addProjectSchema = projectBaseSchema;
export type AddProjectInput = z.infer<typeof addProjectSchema>;

export const editProjectSchema = projectBaseSchema.extend({
  id: z.string().uuid("Ungültige Projekt-ID"),
});
export type EditProjectInput = z.infer<typeof editProjectSchema>;

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

export function validateAddProject(
  data: Record<string, unknown>,
):
  | { success: true; data: AddProjectInput }
  | { success: false; errors: Record<string, string[]> } {
  const result = addProjectSchema.safeParse(data);
  if (result.success) return { success: true, data: result.data };
  const errors: Record<string, string[]> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join(".") || "_";
    (errors[key] ??= []).push(issue.message);
  }
  return { success: false, errors };
}

export function validateEditProject(
  data: Record<string, unknown>,
):
  | { success: true; data: EditProjectInput }
  | { success: false; errors: Record<string, string[]> } {
  const result = editProjectSchema.safeParse(data);
  if (result.success) return { success: true, data: result.data };
  const errors: Record<string, string[]> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join(".") || "_";
    (errors[key] ??= []).push(issue.message);
  }
  return { success: false, errors };
}
