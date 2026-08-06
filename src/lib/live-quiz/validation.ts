import { z } from "zod";

import type { LiveQuizQuestionInput } from "./contracts";

const choiceSchema = z.string().trim().min(1).max(120);

export const liveQuizQuestionInputSchema = z
  .object({
    prompt: z.string().trim().min(4).max(300),
    choices: z.tuple([choiceSchema, choiceSchema, choiceSchema, choiceSchema]),
    correctChoice: z.number().int().min(0).max(3),
    explanation: z.string().trim().max(500).optional().default(""),
    category: z.string().trim().max(40).optional().default(""),
  })
  .strict()
  .superRefine((
    value: LiveQuizQuestionInput,
    context: {
      addIssue(issue: {
        code: "custom";
        path: Array<string | number>;
        message: string;
      }): void;
    },
  ) => {
    const normalized = value.choices.map((choice) =>
      choice.replace(/\s+/g, " ").toLocaleLowerCase("ko-KR"),
    );
    if (new Set(normalized).size !== 4) {
      context.addIssue({
        code: "custom",
        path: ["choices"],
        message: "choices_must_be_unique",
      });
    }
  });

export const liveQuizAnswerSchema = z
  .object({
    sessionKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    questionId: z.string().min(1).max(120),
    selectedChoice: z.number().int().min(0).max(3),
  })
  .strict();

export const liveQuizReviewActionSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("approve"),
      question: liveQuizQuestionInputSchema,
      reviewNote: z.string().trim().max(500).optional().default(""),
    })
    .strict(),
  z
    .object({
      action: z.literal("reject"),
      reviewNote: z.string().trim().min(2).max(500),
    })
    .strict(),
  z.object({ action: z.literal("archive") }).strict(),
]);
