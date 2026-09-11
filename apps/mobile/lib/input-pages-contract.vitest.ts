import { readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(fileURLToPath(new URL(`../${path}`, import.meta.url)), "utf8");
function tags(path: string) {
  const result: string[] = [];
  const file = ts.createSourceFile(
    path,
    read(path),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  function visit(node: ts.Node) {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node))
      result.push(node.tagName.getText(file));
    ts.forEachChild(node, visit);
  }
  visit(file);
  return result;
}

describe("native input route contracts (not device rendering)", () => {
  it.each([
    "components/CardComposer.tsx",
    "components/layouts/AssignmentBoard.tsx",
    "components/plant/ObservationEditor.tsx",
    "screens/student/reading-compose-screen.tsx",
    "screens/student/banner-compose-screen.tsx",
    "app/(student)/feed/compose.tsx",
    "app/(student)/feed/edit.tsx",
  ])("uses a full native input page without a dialog: %s", (path) => {
    expect(tags(path)).toContain("InputPage");
    expect(tags(path)).not.toContain("AppModal");
    expect(tags(path)).not.toContain("Modal");
    expect(read(path)).not.toContain("automaticallyAdjustKeyboardInsets");
  });
  it("has one keyboard owner and no extra scroll owner in the page shell", () => {
    expect(
      tags("components/input-page.tsx").filter(
        (tag) => tag === "KeyboardAvoidingView",
      ),
    ).toHaveLength(1);
    expect(tags("components/input-page.tsx")).not.toContain("ScrollView");
    expect(read("components/input-page.tsx")).toContain(
      'enabled={Platform.OS === "ios"}',
    );
    expect(read("app.config.ts")).toContain(
      'softwareKeyboardLayoutMode: "resize"',
    );
  });
  it("keeps reading state above both native routes without focus timers", () => {
    expect(tags("app/(student)/reading/_layout.tsx")).toContain(
      "ReadingScreenProvider",
    );
    expect(read("screens/student/reading-compose-screen.tsx")).toContain(
      "useReadingScreen()",
    );
    expect(read("screens/student/StudentReadingScreen.tsx")).toContain(
      "useReadingScreen()",
    );
    expect(
      read("screens/student/use-student-reading-screen-model.tsx"),
    ).not.toContain("scrollToField");
  });
  it("shares student card/feed comment behavior and keeps parent sheets", () => {
    expect(read("app/(student)/card/[id]/comments.tsx")).toContain(
      "comment-screen",
    );
    expect(read("app/(student)/feed/[id]/comments.tsx")).toContain(
      'resourceKind="feed"',
    );
    expect(tags("components/comment-thread-frame.tsx")).toEqual(
      expect.arrayContaining(["InputPage", "AppBottomSheet"]),
    );
  });
  it("hides bottom navigation on input routes", () => {
    const source = read("app/(student)/_layout.tsx");
    for (const suffix of ["compose", "edit", "comments", "submit"])
      expect(source).toContain(`pathname.endsWith("/${suffix}")`);
  });
});
