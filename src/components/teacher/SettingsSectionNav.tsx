"use client";

import { useEffect, useState } from "react";

const SECTIONS = [
  { id: "llm", label: "AI" },
  { id: "canva", label: "Canva" },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

function isSectionId(value: string): value is SectionId {
  return SECTIONS.some((section) => section.id === value);
}

export function SettingsSectionNav() {
  const [activeId, setActiveId] = useState<SectionId>("llm");

  useEffect(() => {
    const hashId = window.location.hash.slice(1);
    if (isSectionId(hashId)) setActiveId(hashId);

    const sections = SECTIONS.map(({ id }) => document.getElementById(id)).filter(
      (section): section is HTMLElement => Boolean(section),
    );
    const observer =
      typeof window.IntersectionObserver === "function"
        ? new IntersectionObserver(
            (entries) => {
              const visible = entries
                .filter((entry) => entry.isIntersecting)
                .sort((left, right) => right.intersectionRatio - left.intersectionRatio)[0];
              if (visible && isSectionId(visible.target.id)) setActiveId(visible.target.id);
            },
            { rootMargin: "-22% 0px -62% 0px", threshold: [0.05, 0.25, 0.6] },
          )
        : null;
    sections.forEach((section) => observer?.observe(section));

    const onHashChange = () => {
      const nextId = window.location.hash.slice(1);
      if (isSectionId(nextId)) setActiveId(nextId);
    };
    window.addEventListener("hashchange", onHashChange);
    return () => {
      observer?.disconnect();
      window.removeEventListener("hashchange", onHashChange);
    };
  }, []);

  return (
    <nav className="settings-section-nav" aria-label="설정 섹션">
      {SECTIONS.map((section) => (
        <a
          key={section.id}
          href={`#${section.id}`}
          className={`settings-section-nav-link ${activeId === section.id ? "is-active" : ""}`}
          aria-current={activeId === section.id ? "location" : undefined}
          onClick={() => setActiveId(section.id)}
        >
          {section.label}
        </a>
      ))}
    </nav>
  );
}
