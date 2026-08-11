import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const mobileRoot = path.resolve(import.meta.dirname, "..");
const expectedThinRoutes = new Map([
  ["app/index.tsx", "../screens/LandingScreen"],
  ["app/(student)/index.tsx", "../../screens/student/StudentHomeScreen"],
  ["app/(student)/reading.tsx", "../../screens/student/StudentReadingScreen"],
  ["app/(student)/walking.tsx", "../../screens/student/StudentWalkingScreen"],
  ["app/(student)/slime.tsx", "../../screens/student/StudentSlimeScreen"],
]);
const failures = [];

for (const [relativePath, moduleName] of expectedThinRoutes) {
  const filePath = path.join(mobileRoot, relativePath);
  const source = fs.readFileSync(filePath, "utf8");
  const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  if (sourceFile.statements.length !== 1) {
    failures.push(`${relativePath} must contain one route glue statement.`);
    continue;
  }
  const statement = sourceFile.statements[0];
  if (!ts.isExportDeclaration(statement) || statement.moduleSpecifier?.text !== moduleName) {
    failures.push(`${relativePath} must re-export ${moduleName}.`);
    continue;
  }
  const exportsDefault =
    statement.exportClause &&
    ts.isNamedExports(statement.exportClause) &&
    statement.exportClause.elements.some(
      (element) => (element.propertyName ?? element.name).text === "default",
    );
  if (!exportsDefault) failures.push(`${relativePath} must preserve its default export.`);
}

function routeFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return routeFiles(entryPath);
    return /\.(ts|tsx)$/.test(entry.name) ? [path.relative(mobileRoot, entryPath)] : [];
  });
}

const inventory = routeFiles(path.join(mobileRoot, "app")).sort();
if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(
    `Mobile route inventory OK: ${inventory.length} route modules; ${expectedThinRoutes.size} reviewed routes are thin glue.`,
  );
}
