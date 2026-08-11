import type { ReactNode } from "react";
import type {
  ShadowAllianceGame,
  ShadowAlliancePlayer,
  ShadowAllianceResult,
  ShadowAllianceTeam,
} from "../types";
import { playShadowAllianceGuideTick } from "../sound";

type GuideBlock =
  | { kind: "paragraph"; content: ReactNode }
  | { kind: "formula"; content: string }
  | { kind: "example"; content: ReactNode[] };

export const LOBBY_GUIDES: Array<{ title: string; blocks: GuideBlock[] }> = [
  {
    title: "두 개의 그림자",
    blocks: [
      {
        kind: "paragraph",
        content: (
          <>
          세상은 두 비밀 조직 <strong className="shadow-alliance-guide-black">⚫ 블랙 연합</strong>과
            <strong className="shadow-alliance-guide-white"> ⚪ 화이트 연합</strong>에 의해 은밀히 움직입니다.
            <br />당신은 그 조직의 <strong>공작원</strong>입니다.
            <br />입장하면 둘 중 한 곳에 자동 배정되며,
            <strong>당신만</strong> 자신의 소속을 알 수 있습니다.
          </>
        ),
      },
    ],
  },
  {
    title: "정체는 비밀이다",
    blocks: [
      {
        kind: "paragraph",
        content: (
          <>
            자기 팀을 밝혀도, 거짓을 말해도 좋습니다.
            <br />“나 블랙이야”라는 말이 진실인지 <strong>확인할 방법은 없습니다.</strong>
            <br />모든 진영은 게임이 끝나는 순간에만 드러납니다.
          </>
        ),
      },
    ],
  },
  {
    title: "매 라운드, 하나의 지령",
    blocks: [
      {
        kind: "paragraph",
        content: (
          <>
            본부는 매 라운드 <strong>30 ~ 70 사이의 비밀 지령(숫자)</strong>을 내립니다.
            <br />협상 시간 동안 교실을 자유롭게 돌아다니며 설득·정보 교환·블러핑·배신, 무엇이든 하세요.
            <br />시간 안에 <strong>1 ~ 100 중 숫자 하나</strong>를 제출합니다.
          </>
        ),
      },
      {
        kind: "paragraph",
        content: (
          <>
            모두가 제출해도 <strong>협상 시간(예: 5분)은 끝까지 흐릅니다.</strong>
            <br />시간이 끝나기 전이라면 제출한 숫자를 <strong>몇 번이든 바꿀 수 있습니다.</strong>
            <br />단, 모든 공작원이 협상을 마쳤다면 프로젝터(교사)가 시간을 <strong className="shadow-alliance-guide-keep">일찍 끝낼 수 있습니다.</strong>
          </>
        ),
      },
    ],
  },
  {
    title: "지령에 가까운 자가 지배한다",
    blocks: [
      {
        kind: "paragraph",
        content: (
          <>
            각 연합의 <strong>제출 숫자 평균</strong>을 냅니다.
            <br />지령에 더 <strong>가까운</strong> 연합이 그 라운드를 지배하고 <strong>10,000 세력</strong>을 차지합니다.
            <br />패배 연합은 0, 동점이면 양측 모두 변동 없습니다.
          </>
        ),
      },
    ],
  },
  {
    title: "욕심 vs 팀",
    blocks: [
      {
        kind: "paragraph",
        content: (
          <>
            승리한 연합은 <strong>10,000 세력</strong>을 받아, <strong>우리 편이 낸 숫자 크기만큼</strong> 나눠 갖습니다.
          </>
        ),
      },
      { kind: "formula", content: "10,000 × ( 내 숫자 ÷ 우리 팀 숫자 총합 )" },
      {
        kind: "example",
        content: [
          <p key="intro"><strong>쉽게 말하면:</strong> 우리 팀 3명이 각각 <strong>20, 30, 50</strong>을 냈다면 합은 <strong>100</strong>. 그러면</p>,
          <p key="scores">· 50 낸 친구 → 절반인 <strong>5,000</strong><br />· 30 낸 친구 → <strong>3,000</strong><br />· 20 낸 친구 → <strong>2,000</strong></p>,
          <p key="warning"><strong>큰 숫자를 낼수록 더 많이</strong> 가져갑니다.<br />하지만 모두가 욕심내 큰 숫자만 내면 팀 평균이 지령에서 멀어져 <strong>아예 져 버립니다!</strong></p>,
        ],
      },
    ],
  },
  {
    title: "최후의 공작원",
    blocks: [
      {
        kind: "paragraph",
        content: (
          <>
            총 5라운드.
            <br />누적 세력이 가장 많은 공작원이 최종 승리합니다.
            <br />게임이 끝나면 모든 이의 진영이 공개됩니다.
            <br />“와, 너 우리 팀이었어?”
          </>
        ),
      },
    ],
  },
] as const;

export const REVEAL_STATUS_LINES = [
  "본부, 전 공작원의 보고를 수신하는 중…",
  "암호를 해독하는 중…",
  "⚫ 블랙 연합의 세력을 규합하는 중…",
  "⚪ 화이트 연합의 세력을 규합하는 중…",
  "지령과의 오차를 계산하는 중…",
] as const;
