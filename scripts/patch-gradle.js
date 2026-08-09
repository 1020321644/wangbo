/* eslint-disable no-undef */
/* global require, process, __dirname */
/**
 * patch-gradle.js — 由 prebuildCommand 在 expo prebuild 之后调用
 * 1. 移除 android/app/build.gradle 中的 sentry.gradle apply（无凭证时让 Gradle 失败）
 * 2. 移除 android/build.gradle 中的 async-storage local_repo maven 引用
 */
const fs = require('fs');
const path = require('path');

function dropLine(file, keyword) {
  const full = path.resolve(__dirname, '..', file);
  if (!fs.existsSync(full)) { console.log('SKIP (not found):', file); return; }
  const before = fs.readFileSync(full, 'utf8');
  const after = before.split('\n').filter(function(l) { return l.indexOf(keyword) === -1; }).join('\n');
  if (before !== after) {
    fs.writeFileSync(full, after, 'utf8');
    console.log('PATCHED:', file, '(removed line containing "' + keyword + '")');
  } else {
    console.log('SKIP (line not found):', file, keyword);
  }
}

dropLine('android/app/build.gradle', 'sentry.gradle');
dropLine('android/build.gradle', 'local_repo');
console.log('patch-gradle done');
