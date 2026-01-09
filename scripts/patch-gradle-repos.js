const fs = require("fs");
const path = require("path");

const repoReplacement =
  'maven { url = uri("https://maven.aliyun.com/repository/google") }';

const targets = [
  "node_modules/expo-modules-core/expo-module-gradle-plugin/build.gradle.kts",
  "node_modules/@react-native/gradle-plugin/settings.gradle.kts",
  "node_modules/@react-native/gradle-plugin/settings-plugin/build.gradle.kts",
  "node_modules/@react-native/gradle-plugin/react-native-gradle-plugin/build.gradle.kts",
  "node_modules/expo-modules-autolinking/android/expo-gradle-plugin/settings.gradle.kts",
  "node_modules/expo-modules-autolinking/android/expo-gradle-plugin/expo-autolinking-settings-plugin/build.gradle.kts",
  "node_modules/expo-modules-autolinking/android/expo-gradle-plugin/expo-autolinking-plugin/build.gradle.kts",
];

let patchedCount = 0;

for (const target of targets) {
  const absPath = path.resolve(__dirname, "..", target);
  if (!fs.existsSync(absPath)) {
    continue;
  }

  const original = fs.readFileSync(absPath, "utf8");
  if (original.includes("maven.aliyun.com/repository/google")) {
    continue;
  }

  if (!original.includes("google()")) {
    continue;
  }

  const updated = original.replace(/\bgoogle\(\)/g, repoReplacement);
  if (updated !== original) {
    fs.writeFileSync(absPath, updated, "utf8");
    patchedCount += 1;
  }
}

if (patchedCount === 0) {
  console.log("patch-gradle-repos: no changes needed");
} else {
  console.log(`patch-gradle-repos: patched ${patchedCount} file(s)`);
}
