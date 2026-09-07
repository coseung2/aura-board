import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(".github/workflows/mobile-android-verify.yml", "utf8");
const build = readFileSync(".codex/scripts/build-android.ps1", "utf8");

describe("Android validation workflow safety contract", () => {
  it("runs manually on Windows with read-only permissions", () => {
    expect(workflow).toContain("runs-on: windows-2022");
    expect(workflow).toMatch(/on:\s+workflow_dispatch:/);
    expect(workflow).toMatch(/permissions:\s+contents: read/);
    expect(workflow).not.toMatch(/^\s+(push|pull_request|schedule):/m);
    expect(workflow).not.toContain("id-token: write");
    expect(workflow).not.toContain("secrets.");
    expect(workflow).not.toContain("Infisical/secrets-action");
  });

  it("requires genuine Hermes bytecode and native artifact checks", () => {
    expect(workflow).toContain("npx expo export --platform android --clear");
    expect(workflow).not.toContain("--no-bytecode");
    expect(workflow).toContain("-Filter *.hbc");
    expect(workflow).toContain("C6-1F-BC-03-C1-03-19-1F");
    expect(workflow).toContain("-ForcePrebuild -PrepareOnly");
    expect(workflow).toContain("-SkipNpmInstall -SkipClean -Output Both");
    expect(build).toContain("Android Play release artifact checks failed.");
    expect(workflow).not.toMatch(/continue-on-error:\s*true/);
  });

  it("uses disposable signing and never invokes store submission", () => {
    expect(workflow).toContain("CN=Aura Board CI Validation");
    expect(workflow).toContain("Remove disposable signing key");
    expect(workflow).not.toMatch(/\beas\s+(build|submit)\b/);
    expect(workflow).not.toContain("-SubmitAndroid");
    expect(workflow).toContain("android-validation-${{ github.sha }}");
  });

  it("mirrors screen modules and stops on install/prebuild failures", () => {
    expect(build).toContain("'providers', 'screens', 'scripts', 'theme'");
    expect(build).toMatch(/npm ci\s+if \(\$LASTEXITCODE -ne 0\)/);
    expect(build).toMatch(/npx expo prebuild --platform android --no-install --clean\s+if \(\$LASTEXITCODE -ne 0\)/);
  });
});
