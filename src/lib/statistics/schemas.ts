import { z } from "zod";

export const MissionStatusSchema = z.enum([
  "not_started",
  "in_progress",
  "pending_approval",
  "approved",
  "teacher_working",
  "completed",
]);

export type MissionStatus = z.infer<typeof MissionStatusSchema>;

export const QuestionLadderSchema = z.object({
  issue: z.string().max(500).optional(),
  originalQuestion: z.string().max(500).optional(),
  weakness: z.string().max(500).optional(),
  experience: z.string().max(1000).optional(),
  currentStatus: z.string().max(1000).optional(),
  reason: z.string().max(1000).optional(),
  condition: z.string().max(1000).optional(),
  alternative: z.string().max(1000).optional(),
  position: z.string().max(1000).optional(),
  checklist: z.array(z.string().max(200)).optional(),
  llmFeedback: z.string().max(2000).optional(),
});

export const MissionContentSchema = z.object({
  topic: z.object({
    issue: z.string().max(500).optional(),
    subject: z.string().max(200).optional(),
    curiosity: z.string().max(500).optional(),
    stakeholders: z.string().max(500).optional(),
    relevance: z.string().max(500).optional(),
    stakeholder1: z.string().max(200).optional(),
    stakeholder2: z.string().max(200).optional(),
    stakeholder3: z.string().max(200).optional(),
    stakeholder4: z.string().max(200).optional(),
    perspectivePerson1: z.string().max(200).optional(),
    perspectivePerson2: z.string().max(200).optional(),
    perspectivePerson3: z.string().max(200).optional(),
    perspectivePerson4: z.string().max(200).optional(),
    perspectiveThought1: z.string().max(500).optional(),
    perspectiveThought2: z.string().max(500).optional(),
    perspectiveThought3: z.string().max(500).optional(),
    perspectiveThought4: z.string().max(500).optional(),
    evidence: z.string().max(1000).optional(),
    evidenceChecks: z.array(z.string().max(200)).optional(),
    feasibilityChecks: z.array(z.string().max(200)).optional(),
    title: z.string().max(200).optional(),
  }).optional(),
  questionLadder: QuestionLadderSchema.optional(),
  questionClassification: z.object({
    items: z.array(z.object({
      id: z.string().max(100),
      label: z.string().max(100),
      question: z.string().max(1000),
      category: z.enum(["survey", "direct", "revise"]).nullable(),
    })).optional(),
  }).optional(),
  survey: z.object({
    items: z.array(z.object({
      question: z.string().max(500),
      options: z.array(z.string().max(200)),
      isKeyItem: z.boolean().default(false),
    })).optional(),
  }).optional(),
  investigationPlan: z.object({
    target: z.string().max(500).optional(),
    goalCount: z.number().int().min(1).optional(),
    method: z.string().max(500).optional(),
    period: z.string().max(200).optional(),
    linkOrMethod: z.string().max(500).optional(),
    directQuestions: z.array(z.string().max(1000)).optional(),
    additional: z.array(z.string().max(200)).optional(),
  }).optional(),
  dataCollection: z.object({
    respondentCount: z.number().int().min(0).optional(),
    period: z.string().max(200).optional(),
    notes: z.string().max(2000).optional(),
  }).optional(),
  graphPlans: z.array(z.object({
    content: z.string().max(500),
    type: z.enum(["bar", "pie", "line", "grouped-bar", "map"]),
    insight: z.string().max(500),
  })).optional(),
  interpretation: z.object({
    fact: z.string().max(1000).optional(),
    highest: z.string().max(500).optional(),
    lowest: z.string().max(500).optional(),
    expected: z.string().max(1000).optional(),
    unexpected: z.string().max(1000).optional(),
    meaning: z.string().max(1000).optional(),
  }).optional(),
  conclusion: z.object({
    findings: z.array(z.string().max(500)).optional(),
    conclusion: z.string().max(1000).optional(),
    proposal: z.string().max(1000).optional(),
    schoolAction: z.string().max(500).optional(),
    homeAction: z.string().max(500).optional(),
    friendAction: z.string().max(500).optional(),
    limitations: z.string().max(1000).optional(),
  }).optional(),
  posterRequest: z.object({
    teamName: z.string().max(100).optional(),
    topic: z.string().max(200).optional(),
    posterTitle: z.string().max(200).optional(),
    motivation: z.string().max(1000).optional(),
    questions: z.string().max(1000).optional(),
    subjects: z.string().max(500).optional(),
    methods: z.string().max(500).optional(),
    keyData: z.string().max(1000).optional(),
    graphs: z.string().max(500).optional(),
    discoveries: z.array(z.string().max(500)).optional(),
    conclusion: z.string().max(1000).optional(),
    proposal: z.string().max(1000).optional(),
    limitations: z.string().max(1000).optional(),
    mood: z.string().max(200).optional(),
  }).optional(),
  posterReview: z.object({
    isAccurate: z.boolean().optional(),
    titleCorrect: z.boolean().optional(),
    conclusionVisible: z.boolean().optional(),
    noFabrication: z.boolean().optional(),
    limitationIncluded: z.boolean().optional(),
    revisionRequests: z.string().max(2000).optional(),
  }).optional(),
  presentation: z.object({
    structure: z.array(z.string().max(200)).optional(),
    ready: z.boolean().optional(),
  }).optional(),
});

export type MissionContent = z.infer<typeof MissionContentSchema>;

export const PatchMissionSchema = z.object({
  content: MissionContentSchema.optional(),
  expectedVersion: z.number().int().min(0),
});

export const SubmitMissionSchema = z.object({
  expectedVersion: z.number().int().min(0),
});

export const ApproveMissionSchema = z.object({
  feedback: z.string().max(2000).optional(),
});

export const RejectMissionSchema = z.object({
  feedback: z.string().max(2000),
});
