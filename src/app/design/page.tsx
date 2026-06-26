"use client";

/* ───────────────────────────────────────────────────
   Aura-board Design System - Component Catalog
   Route: /design
   Every ds-* utility class rendered as a visual gallery.
   No data fetching - purely self-contained display.
   ─────────────────────────────────────────────────── */

import { useState } from "react";

export default function DesignPage() {
  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "40px 24px" }}>
      <h1 className="h1" style={{ marginBottom: 8 }}>
        Aura-board Design System
      </h1>
      <p className="ds-body" style={{ color: "var(--color-text-muted)", marginBottom: 40 }}>
        CSS token & component catalog - version 2.0 (Notion-inspired)
      </p>

      <Section title="Typography">
        <div className="ds-card" style={{ padding: 24 }}>
          <div style={{ display: "grid", gap: 8 }}>
            <div><span className="h1">h1 - Display (32px)</span></div>
            <div><span className="h2">h2 - Display (26px)</span></div>
            <div><span className="h3">h3 - Title (20px)</span></div>
            <div><span className="h4">h4 - Subtitle (16px)</span></div>
            <div><span className="h5">h5 - Section (15px)</span></div>
            <div><span className="ds-body">.ds-body - Body (15px)</span></div>
            <div><span className="ds-label">.ds-label - Label (13px)</span></div>
            <div><span className="ds-badge">.ds-badge - Badge (12px)</span></div>
            <div><span className="ds-micro">.ds-micro - Micro (11px)</span></div>
            <div><span className="ds-code">.ds-code - Inline code</span></div>
          </div>
        </div>
      </Section>

      <Section title="Cards">
        <div className="ds-card" style={{ padding: 24 }}>
          <p className="ds-label" style={{ marginBottom: 8 }}>.ds-card - default</p>
          <div className="ds-card" style={{ padding: 16 }}>
            Content inside a card
          </div>
        </div>
        <div style={{ height: 12 }} />
        <div className="ds-card" style={{ padding: 24 }}>
          <p className="ds-label" style={{ marginBottom: 8 }}>.ds-card - hover me</p>
          <div className="ds-card" style={{ padding: 16, cursor: "pointer" }}
            onMouseEnter={e => { (e.target as HTMLElement).style.boxShadow = "var(--shadow-card-hover)"; (e.target as HTMLElement).style.borderColor = "var(--color-border-hover)" }}
            onMouseLeave={e => { (e.target as HTMLElement).style.boxShadow = "var(--shadow-card)"; (e.target as HTMLElement).style.borderColor = "var(--color-border)" }}>
            Hover to see shadow change
          </div>
        </div>
      </Section>

      <Section title="Buttons">
        <div className="ds-card" style={{ padding: 24 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
            <button className="ds-btn-primary">Primary</button>
            <button className="ds-btn-primary" disabled>Primary (disabled)</button>
            <button className="ds-btn-secondary">Secondary</button>
            <button className="ds-btn-secondary" disabled>Secondary (disabled)</button>
          </div>
          <div style={{ height: 12 }} />
          <p className="ds-micro" style={{ color: "var(--color-text-muted)" }}>
            Classes: .ds-btn-primary, .ds-btn-secondary (add disabled attribute for disabled state)
          </p>
        </div>
      </Section>

      <Section title="Pills & Badges">
        <div className="ds-card" style={{ padding: 24 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            <span className="ds-pill">Default pill</span>
            <span className="ds-pill" style={{ background: "var(--color-status-submitted-bg)", color: "var(--color-status-submitted-text)" }}>제출</span>
            <span className="ds-pill" style={{ background: "var(--color-status-reviewed-bg)", color: "var(--color-status-reviewed-text)" }}>확인</span>
            <span className="ds-pill" style={{ background: "var(--color-status-returned-bg)", color: "var(--color-status-returned-text)" }}>반려</span>
            <span className="ds-pill" style={{ background: "var(--color-warning-tinted-bg)", color: "var(--color-warning)" }}>경고</span>
          </div>
          <div style={{ height: 12 }} />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            <span className="mode-badge look">들여다봄</span>
            <span className="mode-badge ask">물어봄</span>
            <span className="status-pill good">정상</span>
            <span className="status-pill idle">대기</span>
            <span className="status-pill warn">주의</span>
          </div>
        </div>
      </Section>

      <Section title="Color Palette">
        <ColorGrid />
      </Section>

      <Section title="Shadows">
        <div className="ds-card" style={{ padding: 24 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 16 }}>
            <ShadowSample name="--shadow-card" value="var(--shadow-card)" />
            <ShadowSample name="--shadow-card-hover" value="var(--shadow-card-hover)" />
            <ShadowSample name="--shadow-lift" value="var(--shadow-lift)" />
            <ShadowSample name="--shadow-accent" value="var(--shadow-accent)" />
            <ShadowSample name="--shadow-accent-hover" value="var(--shadow-accent-hover)" />
          </div>
        </div>
      </Section>

      <Section title="Radius Tokens">
        <div className="ds-card" style={{ padding: 24 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center" }}>
            <RadiusSample name="--radius-card" value="var(--radius-card)" />
            <RadiusSample name="--radius-btn" value="var(--radius-btn)" />
            <RadiusSample name="--radius-control" value="var(--radius-control)" />
            <RadiusSample name="--radius-pill" value="var(--radius-pill)" />
          </div>
        </div>
      </Section>

      <Section title="Logo Lockup">
        <div className="ds-card" style={{ padding: 24 }}>
          <div className="ab-logo-lockup" style={{ marginBottom: 16 }}>
            <div className="ab-logo-img" style={{ background: "linear-gradient(135deg, #7c5cfc, #a78bfa)", display: "grid", placeItems: "center", color: "#fff", fontWeight: 900, fontSize: 18 }}>A</div>
            <span className="ab-logo-wordmark">Aura-board</span>
          </div>
          <p className="ds-micro" style={{ color: "var(--color-text-muted)" }}>
            Classes: .ab-logo-lockup, .ab-logo-img, .ab-logo-wordmark
          </p>
        </div>
      </Section>

      <Section title="Breakpoints">
        <div className="ds-card" style={{ padding: 24 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--color-border)", textAlign: "left" }}>
                <th style={{ padding: "8px 12px", fontWeight: 700 }}>Name</th>
                <th style={{ padding: "8px 12px", fontWeight: 700 }}>Condition</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["Desktop", "default (≥1280px widens container to 1240px)"],
                ["Tablet", "max-width: 1080px"],
                ["Mobile-L", "max-width: 768px"],
                ["Mobile-S", "max-width: 560px"],
              ].map(([name, cond]) => (
                <tr key={name} style={{ borderBottom: "1px solid var(--color-border)" }}>
                  <td style={{ padding: "8px 12px", fontWeight: 600 }}>{name}</td>
                  <td style={{ padding: "8px 12px", color: "var(--color-text-muted)" }}>{cond}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <div style={{ height: 80 }} />
    </div>
  );
}

/* ── Helpers ── */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 32 }}>
      <h2 className="h3" style={{ marginBottom: 12 }}>{title}</h2>
      {children}
    </section>
  );
}

function ColorGrid() {
  const colors = [
    { name: "--color-bg", value: "var(--color-bg)" },
    { name: "--color-surface", value: "var(--color-surface)" },
    { name: "--color-surface-alt", value: "var(--color-surface-alt)" },
    { name: "--color-text", value: "var(--color-text)" },
    { name: "--color-text-muted", value: "var(--color-text-muted)" },
    { name: "--color-text-faint", value: "var(--color-text-faint)" },
    { name: "--color-accent", value: "var(--color-accent)" },
    { name: "--color-accent-active", value: "var(--color-accent-active)" },
    { name: "--color-accent-tinted-bg", value: "var(--color-accent-tinted-bg)" },
    { name: "--color-accent-tinted-text", value: "var(--color-accent-tinted-text)" },
    { name: "--color-border", value: "var(--color-border)" },
    { name: "--color-border-hover", value: "var(--color-border-hover)" },
    { name: "--color-plant-active", value: "var(--color-plant-active)" },
    { name: "--color-plant-visited", value: "var(--color-plant-visited)" },
    { name: "--color-danger", value: "var(--color-danger)" },
    { name: "--color-success", value: "var(--color-success, #12b76a)" },
  ];

  return (
    <div className="ds-card" style={{ padding: 24 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
        {colors.map((c) => (
          <div key={c.name} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: "var(--radius-card)",
              background: c.value, border: "1px solid var(--color-border)",
              flexShrink: 0,
            }} />
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.3 }}>{c.name}</div>
              <div style={{ fontSize: 10, color: "var(--color-text-faint)", fontFamily: "monospace" }}>
                {c.value.replace("var(", "").replace(")", "")}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ShadowSample({ name, value }: { name: string; value: string }) {
  return (
    <div>
      <div style={{
        width: "100%", height: 60, borderRadius: "var(--radius-card)",
        background: "var(--color-surface)", boxShadow: value,
        border: "1px solid var(--color-border)",
        marginBottom: 6,
      }} />
      <div style={{ fontSize: 11, fontWeight: 600 }}>{name}</div>
    </div>
  );
}

function RadiusSample({ name, value }: { name: string; value: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{
        width: 48, height: 48,
        background: "var(--color-accent-tinted-bg)",
        borderRadius: value,
        border: "1px solid var(--color-accent)",
      }} />
      <div style={{ fontSize: 11, fontWeight: 600 }}>{name}</div>
    </div>
  );
}
