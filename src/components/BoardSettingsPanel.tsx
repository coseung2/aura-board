"use client";

import { useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { SidePanel } from "./ui/SidePanel";
import type { AuraBoardSettings } from "./AuraEvaluationControl";
import type { ThumbnailMode } from "./BoardThumbnailPicker";
import { AuraTab } from "./board-settings/AuraTab";
import { BasicTab } from "./board-settings/BasicTab";
import { BreakoutTab } from "./board-settings/BreakoutTab";
import { TAB_LABELS } from "./board-settings/constants";
import type {
  BoardSection,
  BoardSettingsPanelProps,
  BoardSettingsTab,
  BoardTheme,
} from "./board-settings/types";
import { normalizeThumbnailMode } from "./board-settings/utils";

export type { BoardSection, BoardTheme } from "./board-settings/types";

const TAB_LABEL_LINES: Record<BoardSettingsTab, string[]> = {
  basic: ["기본"],
  breakout: ["브레이크", "아웃"],
  canva: ["Canva 연동", "(준비 중)"],
  aura: ["아우라", "연동"],
};

export function BoardSettingsPanel({
  open,
  onClose,
  title = "",
  classrooms = [],
  initialClassroomId = null,
  initialThumbnailMode = "default",
  initialThumbnailUrl = null,
  boardId,
  layout,
  initialSections,
  initialAnonymousAuthor = false,
  initialBoardTheme = "pastel-sky",
  initialShareMode = "private",
  initialShareToken = null,
  initialShareShortCode = null,
  initialStreamTitlePrompt = "",
  initialStreamContentPrompt = "",
  initialStreamSectionsEnabled = false,
  initialAuraSettings = {
    evaluationEnabled: false,
    subject: null,
    unit: null,
    criterion: null,
  },
}: BoardSettingsPanelProps) {
  const router = useRouter();
  const [tab, setTab] = useState<BoardSettingsTab>("basic");
  const [sections, setSections] = useState<BoardSection[]>(initialSections);
  const [anonymousAuthor, setAnonymousAuthor] = useState(initialAnonymousAuthor);
  const [boardTheme, setBoardTheme] = useState<BoardTheme>(initialBoardTheme);
  const [shareMode, setShareMode] = useState(initialShareMode);
  const [shareToken, setShareToken] = useState<string | null>(initialShareToken);
  const [shareShortCode, setShareShortCode] = useState<string | null>(
    initialShareShortCode,
  );
  const [classroomId, setClassroomId] = useState<string | null>(
    initialClassroomId,
  );
  const [thumbnailMode, setThumbnailMode] = useState<ThumbnailMode>(
    normalizeThumbnailMode(initialThumbnailMode),
  );
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(
    initialThumbnailUrl,
  );
  const [streamTitlePrompt, setStreamTitlePrompt] = useState(
    initialStreamTitlePrompt,
  );
  const [streamContentPrompt, setStreamContentPrompt] = useState(
    initialStreamContentPrompt,
  );
  const [streamSectionsEnabled, setStreamSectionsEnabled] = useState(
    initialStreamSectionsEnabled,
  );
  const [auraSettings, setAuraSettings] =
    useState<AuraBoardSettings>(initialAuraSettings);
  const tablistId = useId();

  useEffect(() => {
    if (!open) return;
    setTab("basic");
    setSections(initialSections);
    setAnonymousAuthor(initialAnonymousAuthor);
    setBoardTheme(initialBoardTheme);
    setShareMode(initialShareMode);
    setShareToken(initialShareToken);
    setShareShortCode(initialShareShortCode);
    setClassroomId(initialClassroomId);
    setThumbnailMode(normalizeThumbnailMode(initialThumbnailMode));
    setThumbnailUrl(initialThumbnailUrl);
    setStreamTitlePrompt(initialStreamTitlePrompt);
    setStreamContentPrompt(initialStreamContentPrompt);
    setStreamSectionsEnabled(initialStreamSectionsEnabled);
    setAuraSettings(initialAuraSettings);
  }, [
    open,
    initialSections,
    initialAnonymousAuthor,
    initialBoardTheme,
    initialShareMode,
    initialShareToken,
    initialShareShortCode,
    initialClassroomId,
    initialThumbnailMode,
    initialThumbnailUrl,
    initialStreamTitlePrompt,
    initialStreamContentPrompt,
    initialStreamSectionsEnabled,
    initialAuraSettings,
  ]);

  function handleSectionTokenChange(sectionId: string, nextToken: string | null) {
    setSections((list) =>
      list.map((s) =>
        s.id === sectionId ? { ...s, accessToken: nextToken } : s,
      ),
    );
    router.refresh();
  }

  return (
    <SidePanel open={open} onClose={onClose} title="보드 설정">
      <div
        role="tablist"
        aria-label="보드 설정 탭"
        className="side-panel-tabs"
        id={tablistId}
        style={{ margin: "-16px -20px 16px" }}
      >
        {(Object.keys(TAB_LABELS) as BoardSettingsTab[]).map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            aria-controls={`${tablistId}-panel-${key}`}
            aria-label={key === "canva" ? "Canva 연동 준비 중" : TAB_LABELS[key]}
            id={`${tablistId}-tab-${key}`}
            className="side-panel-tab"
            onClick={() => setTab(key)}
          >
            <span className="board-settings-tab-label" aria-hidden="true">
              {TAB_LABEL_LINES[key].map((line, index) => (
                <span
                  key={`${key}-${index}`}
                  className={
                    key === "canva" && index === 1
                      ? "board-settings-tab-meta"
                      : undefined
                  }
                >
                  {line}
                </span>
              ))}
            </span>
          </button>
        ))}
      </div>

      {tab === "basic" && (
        <div
          role="tabpanel"
          id={`${tablistId}-panel-basic`}
          aria-labelledby={`${tablistId}-tab-basic`}
        >
          <BasicTab
            boardId={boardId}
            layout={layout}
            title={title}
            classrooms={classrooms}
            classroomId={classroomId}
            onClassroomIdChange={setClassroomId}
            thumbnailMode={thumbnailMode}
            thumbnailUrl={thumbnailUrl}
            onThumbnailChange={({ mode, url }) => {
              setThumbnailMode(mode);
              setThumbnailUrl(url);
            }}
            anonymousAuthor={anonymousAuthor}
            onAnonymousAuthorChange={setAnonymousAuthor}
            initialShareMode={shareMode}
            initialShareToken={shareToken}
            initialShareShortCode={shareShortCode}
            boardTheme={boardTheme}
            onThemeChange={setBoardTheme}
            streamTitlePrompt={streamTitlePrompt}
            streamContentPrompt={streamContentPrompt}
            onStreamTitlePromptChange={setStreamTitlePrompt}
            onStreamContentPromptChange={setStreamContentPrompt}
            streamSectionsEnabled={streamSectionsEnabled}
            onStreamSectionsEnabledChange={setStreamSectionsEnabled}
          />
        </div>
      )}

      {tab === "breakout" && (
        <div
          role="tabpanel"
          id={`${tablistId}-panel-breakout`}
          aria-labelledby={`${tablistId}-tab-breakout`}
        >
          <BreakoutTab
            boardId={boardId}
            title={title}
            layout={layout}
            classrooms={classrooms}
            classroomId={classroomId}
            sections={sections}
            streamSectionsEnabled={streamSectionsEnabled}
            streamTitlePrompt={streamTitlePrompt}
            streamContentPrompt={streamContentPrompt}
            onTokenChange={handleSectionTokenChange}
          />
        </div>
      )}

      {tab === "canva" && (
        <div
          role="tabpanel"
          id={`${tablistId}-panel-canva`}
          aria-labelledby={`${tablistId}-tab-canva`}
        >
          <div className="board-settings-placeholder">
            <span className="board-settings-placeholder-mark" aria-hidden="true">
              Canva
            </span>
            <p>
              준비 중이에요. 곧 이곳에서 보드 단위 Canva 연동 설정을
              관리할 수 있어요.
            </p>
          </div>
        </div>
      )}

      {tab === "aura" && (
        <div
          role="tabpanel"
          id={`${tablistId}-panel-aura`}
          aria-labelledby={`${tablistId}-tab-aura`}
        >
          <AuraTab
            boardId={boardId}
            value={auraSettings}
            onChange={setAuraSettings}
          />
        </div>
      )}
    </SidePanel>
  );
}
