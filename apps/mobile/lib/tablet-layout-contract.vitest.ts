import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, URL } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../", import.meta.url));
type Opening = ts.JsxOpeningElement | ts.JsxSelfClosingElement;

function source(relativePath: string) {
  return ts.createSourceFile(relativePath, readFileSync(join(root, relativePath), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}
function openings(file: ts.SourceFile, name: string): Opening[] {
  const results: Opening[] = [];
  function visit(node: ts.Node) {
    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && node.tagName.getText(file) === name) results.push(node);
    ts.forEachChild(node, visit);
  }
  visit(file);
  return results;
}
function prop(node: Opening, name: string) {
  return node.attributes.properties.find((attribute): attribute is ts.JsxAttribute => ts.isJsxAttribute(attribute) && attribute.name.getText() === name);
}
function tsxFiles(relativePath: string): string[] {
  return readdirSync(join(root, relativePath), { withFileTypes: true }).flatMap((entry) => {
    const next = `${relativePath}/${entry.name}`;
    return entry.isDirectory() ? tsxFiles(next) : entry.name.endsWith(".tsx") ? [next] : [];
  });
}

// Structural guards complement geometry tests; they are not native rendering tests.
describe("tablet layout integration contracts", () => {
  it("opts every native modal into both landscape rotations", () => {
    const modals = ["app", "components", "screens"].flatMap(tsxFiles)
      .flatMap((path) => openings(source(path), "Modal").map((node) => ({ path, node })));
    expect(modals.length).toBeGreaterThan(0);
    for (const { path, node } of modals) {
      expect(prop(node, "supportedOrientations")?.initializer?.getText(), path).toBe("{MODAL_ORIENTATIONS}");
    }
  });

  it("does not regress explicit screen safe edges to top-only", () => {
    for (const path of ["app", "components", "screens"].flatMap(tsxFiles)) {
      for (const node of openings(source(path), "SafeAreaView")) {
        const attribute = prop(node, "edges")?.initializer;
        if (!attribute || !ts.isJsxExpression(attribute) || !attribute.expression || !ts.isArrayLiteralExpression(attribute.expression)) continue;
        const edges = attribute.expression.elements.filter(ts.isStringLiteral).map((element) => element.text);
        expect(edges, path).toEqual(expect.arrayContaining(["left", "right"]));
      }
    }
  });

  it.each([
    "components/slime/SlimePurchaseConfirmModal.tsx",
    "components/plant/NoPhotoReasonModal.tsx",
    "components/plant/RoadmapStagePicker.tsx",
    "components/game-platform/GameExitDialog.tsx",
  ])("keeps a scrolling body and separate actions in %s", (path) => {
    const modal = openings(source(path), "AppModal")[0];
    expect(modal).toBeDefined();
    expect(prop(modal, "scrollable")).toBeDefined();
    expect(prop(modal, "footer")).toBeDefined();
  });

  it.each([
    "components/WalkingPermissionOnboarding.tsx",
    "screens/student/student-walking-view.tsx",
    "app/(parent)/walking.tsx",
  ])("makes variable-length permission/settings content scrollable in %s", (path) => {
    expect(prop(openings(source(path), "AppModal")[0], "scrollable")).toBeDefined();
  });

  it("preserves existing scroll owners rather than nesting all games", () => {
    const dispatcher = source("app/(student)/board/[slug].tsx");
    const shell = openings(dispatcher, "GameAreaShell")[0];
    expect(prop(shell, "scrollEnabled")?.initializer?.getText()).toBe('{board.layout === "speed-game"}');
    const gameShell = source("components/game-platform/GameAreaShell.tsx");
    expect(openings(gameShell, "ScrollView")).toHaveLength(1);
    expect(gameShell.text).toContain("{scrollEnabled ? (");
    expect(gameShell.text).not.toContain("_scrollEnabled");
    expect(source("components/game-platform/GameHud.tsx").text).not.toContain('position: "absolute"');
  });

  it("provides a quiz scroll fallback and does not truncate answer choices", () => {
    const quiz = source("components/layouts/QuizBoard.tsx");
    expect(openings(quiz, "ScrollView")).toHaveLength(1);
    const option = openings(quiz, "Text").find((node) => prop(node, "style")?.initializer?.getText() === "{styles.optText}");
    expect(option).toBeDefined();
    expect(prop(option!, "numberOfLines")).toBeUndefined();
  });

  it("uses measured keyboard frames and does not remount dialogs on orientation", () => {
    const ui = source("components/ui.tsx");
    expect(ui.text).toContain("onLayout={onLayout}");
    expect(ui.text).toContain("fitOverlaySurface(frame");
    for (const modal of openings(ui, "Modal")) expect(prop(modal, "key")).toBeUndefined();
    for (const path of ["components/layouts/CardsBoard.tsx", "components/layouts/ColumnsBoard.tsx"]) {
      expect(source(path).text).toContain("isWideViewport(width)");
      expect(source(path).text).not.toContain("isPortraitTabletViewport");
    }
  });
});
