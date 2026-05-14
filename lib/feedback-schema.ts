import { z } from "zod";

export const feedbackSchema = z.object({
  scoreOutOf10: z
    .number()
    .min(0)
    .max(10)
    .describe("Overall delivery score, 0-10, with one decimal."),
  takeaway: z
    .string()
    .describe(
      "2–3 sentence high-level summary. Honest. Names the strongest beat and the single biggest weakness.",
    ),
  strengths: z
    .array(z.string())
    .min(2)
    .max(6)
    .describe("Concrete, specific things that landed. Reference actual moments."),
  topFixes: z
    .array(
      z.object({
        title: z.string().describe("Imperative one-liner — the change to make."),
        detail: z
          .string()
          .describe("1–2 sentences. WHY it matters and HOW to do it next time."),
      }),
    )
    .min(3)
    .max(3)
    .describe("Exactly three. Ranked by impact."),
  paceFeedback: z
    .string()
    .describe(
      "Specific feedback on tempo — reference WPM, where it spiked, where it dragged.",
    ),
  fillerFeedback: z
    .string()
    .describe(
      "Specific feedback on filler words — count by category, where clusters happened.",
    ),
  structureFeedback: z
    .string()
    .describe(
      "Arc evaluation — opening / middle / closing. For talks: hook → premise → evidence → close. For interviews: STAR coverage.",
    ),
  alignmentFeedback: z
    .string()
    .describe(
      "If a brief/goal/material was provided: how well the delivery matched. Empty string if no context provided.",
    ),
  rehearsalPrompts: z
    .array(z.string())
    .min(3)
    .max(3)
    .describe(
      "Exactly three prompts for the next take. Concrete. Each forces a different practice goal.",
    ),
  notableMoments: z
    .array(
      z.object({
        time: z
          .string()
          .regex(/^\d{1,2}:\d{2}$/)
          .describe("mm:ss timestamp in the recording."),
        kind: z.enum(["strong", "watch"]),
        body: z.string().describe("8–12 words. What happened."),
      }),
    )
    .min(3)
    .max(7),
  // Nullable rather than optional — OpenAI structured outputs in strict
  // mode require every property in `required`. Only set for interview
  // rehearsals; null for talks/pitches/other.
  starArc: z
    .number()
    .min(0)
    .max(4)
    .nullable()
    .describe(
      "Interview-only. How many of Situation, Task, Action, Result were clearly delivered. 0-4. null if rehearsal is not an interview.",
    ),
  keyTermsHit: z
    .number()
    .min(0)
    .nullable()
    .describe("Count of brief key terms actually used. null if no brief provided."),
  keyTermsTotal: z
    .number()
    .min(0)
    .nullable()
    .describe("Total brief key terms looked for. null if no brief provided."),
});

export type Feedback = z.infer<typeof feedbackSchema>;
