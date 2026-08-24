import { z } from "zod";

function optionalText(max: number) {
  return z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined));
}

export const personaInputSchema = z.object({
  name: z.string().trim().min(1).max(50),
  gender: optionalText(30),
  age: z.coerce.number().int().min(1).max(120).optional(),
  description: optionalText(2000),
  personality: optionalText(2000),
  appearance: optionalText(2000),
  additionalContext: optionalText(2000),
  isDefault: z.boolean().default(false),
});

export type PersonaInput = z.infer<typeof personaInputSchema>;
export const personaUpdateSchema = personaInputSchema.partial();
export type PersonaUpdateInput = z.infer<typeof personaUpdateSchema>;
