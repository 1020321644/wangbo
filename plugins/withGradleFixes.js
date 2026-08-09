/* eslint-disable no-undef */
const fs = require("fs");
const path = require("path");

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

function withGradleFixes(config) {
  return config;
}

module.exports = withGradleFixes;
