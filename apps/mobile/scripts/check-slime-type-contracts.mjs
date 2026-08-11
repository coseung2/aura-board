import path from "node:path";
import ts from "typescript";

const mobileRoot = path.resolve(import.meta.dirname, "..");
const roots = [
  path.join(mobileRoot, "lib", "slime-buffs.ts"),
  path.join(mobileRoot, "lib", "slime-domain-helpers.ts"),
  path.join(
    mobileRoot,
    "lib",
    "student-slime-screen",
    "student-slime-screen.types.ts",
  ),
  path.join(mobileRoot, "screens", "student", "StudentSlimeScreen.tsx"),
];
const program = ts.createProgram(roots, {
  strict: true,
  noEmit: true,
  skipLibCheck: true,
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  jsx: ts.JsxEmit.ReactJSX,
  allowJs: false,
});
const diagnostics = roots.flatMap((filename) => {
  const sourceFile = program.getSourceFile(filename);
  if (!sourceFile) return [{ file: undefined, start: undefined, messageText: `Missing root ${filename}`, category: ts.DiagnosticCategory.Error, code: 0 }];
  return [
    ...program.getSyntacticDiagnostics(sourceFile),
    ...program.getSemanticDiagnostics(sourceFile),
  ];
});
const presentationRoot = path.join(mobileRoot, "components", "student-screens");
for (const entry of ts.sys.readDirectory(presentationRoot, [".ts", ".tsx"])) {
  if (!path.basename(entry).startsWith("student-slime")) continue;
  const source = ts.createSourceFile(
    entry,
    ts.sys.readFile(entry) ?? "",
    ts.ScriptTarget.Latest,
    true,
  );
  for (const statement of source.statements) {
    if (
      ts.isImportDeclaration(statement) &&
      ts.isStringLiteral(statement.moduleSpecifier) &&
      statement.moduleSpecifier.text.includes("screens/")
    ) {
      diagnostics.push({
        file: source,
        start: statement.moduleSpecifier.getStart(source),
        messageText: "Student slime presentation components must not import screens.",
        category: ts.DiagnosticCategory.Error,
        code: 0,
      });
    }
  }
}

if (diagnostics.length > 0) {
  console.error(
    ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCanonicalFileName: (filename) => filename,
      getCurrentDirectory: () => mobileRoot,
      getNewLine: () => "\n",
    }),
  );
  process.exitCode = 1;
} else {
  console.log("Slime type/dependency compile check passed (4 roots). ");
}
