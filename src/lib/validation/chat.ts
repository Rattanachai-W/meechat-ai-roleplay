import { z } from "zod";

export const createConversationSchema = z.object({
  characterId: z.string().uuid(),
  personaId: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(1).max(120).optional(),
});

export type CreateConversationInput = z.infer<typeof createConversationSchema>;

export const updateConversationSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  personaId: z.string().uuid().nullable().optional(),
});

export const chatRequestSchema = z.object({
  conversationId: z.string().uuid(),
  content: z.string().trim().min(1).max(4000),
});

export type ChatRequestBody = z.infer<typeof chatRequestSchema>;

export const regenerateRequestSchema = z.object({
  assistantMessageId: z.string().uuid(),
});
