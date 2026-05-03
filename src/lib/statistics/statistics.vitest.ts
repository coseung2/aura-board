import { describe, it, expect } from "vitest";
import {
  MissionStatusSchema,
  MissionContentSchema,
  PatchMissionSchema,
  SubmitMissionSchema,
  ApproveMissionSchema,
  RejectMissionSchema,
  QuestionLadderSchema,
} from "./schemas";

describe("statistics schemas", () => {
  it("MissionStatusSchema accepts valid statuses", () => {
    expect(MissionStatusSchema.parse("not_started")).toBe("not_started");
    expect(MissionStatusSchema.parse("approved")).toBe("approved");
  });

  it("MissionStatusSchema rejects invalid status", () => {
    expect(() => MissionStatusSchema.parse("invalid")).toThrow();
  });

  it("QuestionLadderSchema accepts valid payload", () => {
    const payload = {
      experience: "들어본 적 있습니다.",
      currentStatus: "학교 주변 5곳",
      llmFeedback: "좋은 질문입니다!",
    };
    const result = QuestionLadderSchema.parse(payload);
    expect(result.experience).toBe(payload.experience);
    expect(result.llmFeedback).toBe(payload.llmFeedback);
  });

  it("MissionContentSchema accepts minimal content", () => {
    const result = MissionContentSchema.parse({ topic: { subject: "노키즈존" } });
    expect(result.topic?.subject).toBe("노키즈존");
  });

  it("PatchMissionSchema requires expectedVersion", () => {
    expect(() => PatchMissionSchema.parse({ content: {} })).toThrow();
    const valid = PatchMissionSchema.parse({ content: {}, expectedVersion: 3 });
    expect(valid.expectedVersion).toBe(3);
  });

  it("SubmitMissionSchema requires expectedVersion", () => {
    expect(() => SubmitMissionSchema.parse({})).toThrow();
    expect(SubmitMissionSchema.parse({ expectedVersion: 0 }).expectedVersion).toBe(0);
  });

  it("ApproveMissionSchema accepts optional feedback", () => {
    expect(ApproveMissionSchema.parse({})).toEqual({});
    expect(ApproveMissionSchema.parse({ feedback: "잘했어요" }).feedback).toBe("잘했어요");
  });

  it("RejectMissionSchema requires feedback", () => {
    expect(() => RejectMissionSchema.parse({})).toThrow();
    expect(RejectMissionSchema.parse({ feedback: "수정 필요" }).feedback).toBe("수정 필요");
  });
});
