"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const { withAndroidManifest, withDangerousMod } = require("@expo/config-plugins");

const RESOURCE_FILE = "network_security_config.xml";

/**
 * Let Android debug builds trust user-installed CAs (for example, the local
 * GBE SSL inspection certificate) while keeping release builds on system CAs.
 *
 * Expo Go cannot consume this app-level manifest/resource change; use a local
 * or EAS development client after prebuild. The debug-overrides block is
 * ignored by Android release builds, so production traffic is unaffected.
 */
module.exports = function withAndroidDebugNetworkSecurity(config) {
  config = withAndroidManifest(config, (manifestConfig) => {
    const application = manifestConfig.modResults.manifest.application?.[0];
    if (!application) {
      throw new Error("Unable to find the Android application manifest entry.");
    }

    application.$ = application.$ ?? {};
    application.$["android:networkSecurityConfig"] = `@xml/${RESOURCE_FILE.replace(
      /\.xml$/,
      "",
    )}`;
    return manifestConfig;
  });

  return withDangerousMod(config, ["android", async (dangerousConfig) => {
    const mainResXmlDir = path.join(
      dangerousConfig.modRequest.platformProjectRoot,
      "app",
      "src",
      "main",
      "res",
      "xml",
    );
    const debugResXmlDir = path.join(
      dangerousConfig.modRequest.platformProjectRoot,
      "app",
      "src",
      "debug",
      "res",
      "xml",
    );
    await fs.mkdir(mainResXmlDir, { recursive: true });
    await fs.mkdir(debugResXmlDir, { recursive: true });
    await fs.writeFile(
      path.join(mainResXmlDir, RESOURCE_FILE),
      `<?xml version="1.0" encoding="utf-8"?>
<network-security-config />
`,
      "utf8",
    );
    await fs.writeFile(
      path.join(debugResXmlDir, RESOURCE_FILE),
      `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <base-config cleartextTrafficPermitted="true">
        <trust-anchors>
            <certificates src="system" />
            <certificates src="user" />
        </trust-anchors>
    </base-config>
</network-security-config>
`,
      "utf8",
    );
    return dangerousConfig;
  }]);
};
