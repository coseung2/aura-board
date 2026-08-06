"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";

const TABS = [
  { id: "ai", label: "AI" },
  { id: "integrations", label: "외부연동" },
] as const;

export type SettingsContentTabId = (typeof TABS)[number]["id"];

type Props = {
  title?: ReactNode;
  ai: ReactNode;
  integrations: ReactNode;
};

function isTabId(value: string): value is SettingsContentTabId {
  return TABS.some((tab) => tab.id === value);
}

export function SettingsContentTabs({ title = "교사 설정", ai, integrations }: Props) {
  const [activeId, setActiveId] = useState<SettingsContentTabId>("ai");

  useEffect(() => {
    const hashId = window.location.hash.slice(1);
    if (hashId === "canva" || hashId === "integrations") {
      setActiveId("integrations");
      return;
    }
    if (hashId === "llm" || hashId === "ai" || isTabId(hashId)) {
      setActiveId("ai");
    }
  }, []);

  const selectTab = (tabId: SettingsContentTabId) => {
    setActiveId(tabId);
    const url = new URL(window.location.href);
    url.hash = tabId;
    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${url.search}#${tabId}`,
    );
  };

  return (
    <div className="settings-content-tabs-shell">
      <header className="student-assignment-header teacher-settings-page-header">
        <div>
          <h1 className="teacher-settings-page-title">{title}</h1>
        </div>
        <div
          className="student-assignment-summary"
          role="tablist"
          aria-label="설정 구분"
        >
          {TABS.map((tab) => {
            const selected = activeId === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                id={`settings-tab-${tab.id}`}
                aria-controls={`settings-panel-${tab.id}`}
                aria-selected={selected}
                tabIndex={selected ? 0 : -1}
                className={`student-assignment-summary-chip${selected ? " is-active" : ""}`}
                onClick={() => selectTab(tab.id)}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </header>

      <section
        id="settings-panel-ai"
        className="settings-content-tabpanel"
        role="tabpanel"
        aria-labelledby="settings-tab-ai"
        hidden={activeId !== "ai"}
      >
        {ai}
      </section>

      <section
        id="settings-panel-integrations"
        className="settings-content-tabpanel"
        role="tabpanel"
        aria-labelledby="settings-tab-integrations"
        hidden={activeId !== "integrations"}
      >
        {integrations}
      </section>
    </div>
  );
}
