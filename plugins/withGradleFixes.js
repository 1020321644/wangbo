/* eslint-disable no-undef */
const fs = require("fs");
const path = require("path");
const { withProjectBuildGradle } = require("@expo/config-plugins");

function dropLine(filePath, keyword) {
  if (!fs.existsSync(filePath)) return false;
  const before = fs.readFileSync(filePath, "utf8");
  const after = before.split("\n").filter(function (l) { return l.indexOf(keyword) === -1; }).join("\n");
  if (before !== after) {
    fs.writeFileSync(filePath, after, "utf8");
    console.log("[withGradleFixes] PATCHED:", filePath);
    return true;
  }
  return false;
}

// 把 android.kotlinVersion= 改为 kotlinVersion=（去掉 android. 前缀）
// ExpoRootProjectPlugin 读取的是 root ext 的 kotlinVersion（无前缀），
// android. 前缀的属性无法被命中，导致 KSP 版本查找失败
// 同时补充 kspVersion，因为 KSPLookup 不含 1.9.x，不显式指定会抛异常
function fixKotlinVersionProp(filePath) {
  if (!fs.existsSync(filePath)) return false;
  const before = fs.readFileSync(filePath, "utf8");
  let after = before.replace(/^android\.kotlinVersion=/m, "kotlinVersion=");
  // 若已存在 kotlinVersion= 行则不重复添加 kspVersion
  if (after.indexOf("kotlinVersion=") !== -1 && after.indexOf("kspVersion=") === -1) {
    after = after.replace(/^(kotlinVersion=.*)$/m, "$1\nkspVersion=1.9.24-1.0.20");
  }
  if (before !== after) {
    fs.writeFileSync(filePath, after, "utf8");
    console.log("[withGradleFixes] PATCHED kotlinVersion/kspVersion:", filePath);
    return true;
  }
  return false;
}

// 注入 ndkVersion 到 gradle.properties（供 rootProject.ext.ndkVersion 读取）
// onnxruntime-react-native 的 CMake 构建依赖 NDK
function addNdkVersion(filePath) {
  if (!fs.existsSync(filePath)) return false;
  const before = fs.readFileSync(filePath, "utf8");
  if (before.indexOf("ndkVersion=") !== -1) return false;
  const after = before + "\nndkVersion=27.1.12297006\n";
  fs.writeFileSync(filePath, after, "utf8");
  console.log("[withGradleFixes] PATCHED ndkVersion:", filePath);
  return true;
}

// 模块加载时注册 beforeExit 钩子：prebuild 生成原生文件后、进程退出前执行
// 此时 android/app/build.gradle 和 android/build.gradle 已生成
process.on("beforeExit", function () {
  try {
    const root = process.cwd();
    dropLine(path.join(root, "android/app/build.gradle"), "sentry.gradle");
    dropLine(path.join(root, "android/build.gradle"), "local_repo");
    fixKotlinVersionProp(path.join(root, "android/gradle.properties"));
    // 注入 ndkVersion：onnxruntime-react-native 的 CMake 构建需要 NDK，
    // 而 app/build.gradle 引用 rootProject.ext.ndkVersion，需在 gradle.properties 定义
    addNdkVersion(path.join(root, "android/gradle.properties"));
  } catch (e) {
    console.log("[withGradleFixes] beforeExit error:", e.message);
  }
});

/**
 * 把 ffmpeg-kit-next 的本地 Maven 仓库路径注入 android/build.gradle 的 allprojects.repositories。
 * 新版 Gradle 不再向上传播子模块声明的 maven 仓库，必须在根 build.gradle 显式注册。
 */
function withFfmpegKitMavenRepo(config) {
  return withProjectBuildGradle(config, function (cfg) {
    const contents = cfg.modResults.contents;
    // 已注入则跳过
    if (contents.includes("ffmpeg-kit-react-native/android/libs-maven")) return cfg;
    // 在 allprojects { repositories { ... } } 内的最后一个 maven 或 google() 之前插入
    const injection = [
      "        maven {",
      "            // ffmpeg-kit-next 本地 AAR 仓库（richkuo7 vendor 构建，绕开 Maven Central 下架问题）",
      "            url(new File(rootDir, \"../node_modules/ffmpeg-kit-react-native/android/libs-maven\").absolutePath)",
      "        }",
    ].join("\n");
    cfg.modResults.contents = contents.replace(
      /(allprojects\s*\{[^}]*repositories\s*\{)/,
      "$1\n" + injection
    );
    return cfg;
  });
}

function withGradleFixes(config) {
  return withFfmpegKitMavenRepo(config);
}

module.exports = withGradleFixes;
