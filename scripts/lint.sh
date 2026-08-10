#!/bin/sh
# 项目级 lint 包装脚本
# 在调用 miaoda-expo-devkit 的 lint 之前，把项目级 oxlint.json 的规则覆盖
# 合并进 devkit 内置的 oxlint-config.json，以禁用加载失败的规则
# （如 no-invalid-notification-config）。
#
# 用法：在 package.json 中配置 "lint": "sh scripts/lint.sh"

set -e

# 把本地 node_modules/.bin 加入 PATH，确保 oxlint/biome 等二进制可被直接调用
export PATH="$(pwd)/node_modules/.bin:$PATH"

DEVKIT_DIR=$(node -e "const p=require('path');const r=require.resolve('miaoda-expo-devkit');console.log(p.dirname(p.dirname(r)))")
DEVKIT_OXCONFIG="$DEVKIT_DIR/oxlint-config.json"
PROJECT_ROOT=$(pwd)
PROJECT_OXCONFIG="$PROJECT_ROOT/oxlint.json"

if [ -f "$PROJECT_OXCONFIG" ]; then
  node -e "
    const fs = require('fs');
    const devkit = JSON.parse(fs.readFileSync('$DEVKIT_OXCONFIG', 'utf8'));
    let proj = {};
    try { proj = JSON.parse(fs.readFileSync('$PROJECT_OXCONFIG', 'utf8')); } catch {}
    devkit.rules = Object.assign({}, devkit.rules, proj.rules || {});
    // 合并项目级 ignorePatterns（用于排除 plugins/ scripts/ 等 CJS 目录）
    const projIgnore = proj.ignorePatterns || [];
    const devkitIgnore = devkit.ignorePatterns || [];
    const merged = Array.from(new Set([...devkitIgnore, ...projIgnore]));
    if (merged.length) devkit.ignorePatterns = merged;
    fs.writeFileSync('$DEVKIT_OXCONFIG', JSON.stringify(devkit, null, 2) + '\n');
  "
fi

node "$DEVKIT_DIR/dist/cli/lint.js" "$@"