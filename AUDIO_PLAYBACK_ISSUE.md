# 🐛 音频转换后无法播放问题分析

## 📅 问题信息

**报告时间**: 2026-08-05  
**用户反馈**: "转换音乐出来没法播放"  
**截图**: 后台录制母带页面  

---

## 🔍 问题分析

### 可能的原因

#### 1. **AAC 格式扩展名问题** ⚠️ 最可能

**问题**:
- `formats.ts` 中 AAC 格式的扩展名定义为 `.aac`
- 但实际上 **AAC 音频文件通常使用 `.m4a` 扩展名**
- 直接使用 `.aac` 扩展名可能导致播放器无法识别

**代码位置**: `src/lib/formats.ts:27`
```typescript
{ key: "AAC", label: "AAC", ext: "aac", ... }
```

**修复方案**:
```typescript
{ key: "AAC", label: "AAC", ext: "m4a", ... }
```

**原因说明**:
- `.aac` 是裸 AAC 音频流（ADTS 格式），很多播放器不支持
- `.m4a` 是 AAC 音频封装在 MP4 容器中，兼容性更好
- iOS/Android 原生播放器都支持 `.m4a`，但不一定支持 `.aac`

---

#### 2. **FFmpeg 命令问题** ⚠️ 需要验证

**问题**:
- AAC 编码命令可能不完整
- 缺少 MP4 容器封装参数

**当前代码**: `src/lib/audioEngine.ts:56`
```typescript
case "AAC":
  return ["-ar", sampleRateNum, ...masterFilters, "-c:a", "aac", "-b:a", `${kbps}k`];
```

**可能需要的修复**:
```typescript
case "AAC":
  return [
    "-ar", sampleRateNum, 
    ...masterFilters, 
    "-c:a", "aac", 
    "-b:a", `${kbps}k`,
    "-f", "mp4",  // 指定 MP4 容器格式
    "-movflags", "+faststart"  // 优化流式播放
  ];
```

---

#### 3. **文件路径问题** ⚠️ 需要验证

**问题**:
- 转换后的文件可能保存在 cache 目录
- 播放器可能无法访问 cache 目录的文件

**代码位置**: `src/lib/audioEngine.ts:188`
```typescript
const cacheDir = FileSystem.cacheDirectory ?? "";
const outName  = safeCacheName(sourceName, outExt);
const outUri   = `${cacheDir}${outName}`;
```

**可能的问题**:
- Android/iOS 的 cache 目录权限限制
- 文件可能在播放前被系统清理

---

#### 4. **文件完整性问题** ⚠️ 需要验证

**问题**:
- FFmpeg 转换失败但没有正确报错
- 输出文件不完整或损坏

**代码位置**: `src/lib/audioEngine.ts:245-260`
```typescript
if (ReturnCode.isSuccess(rc)) {
  // 校验输出文件确实写入
  const stat = await FileSystem.getInfoAsync(outUri);
  if (stat.exists) {
    onProgress(1, "输出文件就绪");
    return outUri;
  }
}

// FFmpeg 失败：降级为文件复制（至少保证导出可用）
const logs = await session.getAllLogsAsString();
console.warn("[FFmpeg] 转换失败，降级为文件复制。日志：", logs?.slice(-400));
```

**可能的问题**:
- 文件存在但大小为 0
- 文件头不完整
- 编码参数不兼容

---

## 🔧 修复方案

### 方案 1: 修复 AAC 扩展名（推荐）✅

**修改文件**: `src/lib/formats.ts`

```typescript
// 修改前
{ key: "AAC", label: "AAC", ext: "aac", lossless: false, dsd: false, desc: "有损压缩 · 高效编码 · Apple/YouTube 标准", supportsBitDepth: false, supportsBitrate: true },

// 修改后
{ key: "AAC", label: "AAC", ext: "m4a", lossless: false, dsd: false, desc: "有损压缩 · 高效编码 · Apple/YouTube 标准", supportsBitDepth: false, supportsBitrate: true },
```

**影响**:
- ✅ 提高播放器兼容性
- ✅ 符合行业标准
- ✅ iOS/Android 原生支持
- ⚠️ 需要更新 FFmpeg 命令以输出 MP4 容器

---

### 方案 2: 优化 FFmpeg AAC 编码命令 ✅

**修改文件**: `src/lib/audioEngine.ts`

```typescript
// 修改前
case "AAC":
  return ["-ar", sampleRateNum, ...masterFilters, "-c:a", "aac", "-b:a", `${kbps}k`];

// 修改后
case "AAC":
  return [
    "-ar", sampleRateNum, 
    ...masterFilters, 
    "-c:a", "aac", 
    "-b:a", `${kbps}k`,
    "-f", "mp4",  // 指定 MP4 容器
    "-movflags", "+faststart"  // 优化流式播放
  ];
```

**影响**:
- ✅ 确保输出 MP4 容器格式
- ✅ 优化流式播放性能
- ✅ 提高兼容性

---

### 方案 3: 添加文件完整性检查 ✅

**修改文件**: `src/lib/audioEngine.ts`

```typescript
if (ReturnCode.isSuccess(rc)) {
  // 校验输出文件确实写入
  const stat = await FileSystem.getInfoAsync(outUri);
  if (stat.exists && stat.size > 0) {  // ✅ 添加大小检查
    onProgress(1, "输出文件就绪");
    return outUri;
  } else {
    console.warn("[FFmpeg] 输出文件无效：", stat);
  }
}
```

**影响**:
- ✅ 防止返回空文件
- ✅ 提供更好的错误信息

---

### 方案 4: 添加详细的 FFmpeg 日志 ✅

**修改文件**: `src/lib/audioEngine.ts`

```typescript
try {
  const extraArgs = buildFfmpegArgs(target, params);
  const cmd = `-y -i "${sourceUri}" ${extraArgs.join(" ")} "${outUri}"`;
  
  // ✅ 添加日志
  console.log("[FFmpeg] 执行命令：", cmd);
  
  const session = await FFmpegKit.execute(cmd);
  const rc = await session.getReturnCode();
  
  // ✅ 添加详细日志
  const logs = await session.getAllLogsAsString();
  console.log("[FFmpeg] 返回码：", rc);
  console.log("[FFmpeg] 完整日志：", logs);
  
  // ...
}
```

**影响**:
- ✅ 方便调试
- ✅ 快速定位问题

---

## 🧪 测试步骤

### 1. 修复后测试

1. **应用修复**
   ```bash
   cd /workspace/app-dk2quyiid79d
   # 修改 formats.ts 和 audioEngine.ts
   ```

2. **重新构建**
   ```bash
   rm -rf android ios node_modules/.cache
   npx expo prebuild --clean
   npx expo run:android
   ```

3. **测试转换**
   - 打开应用主页
   - 选择一个音频文件
   - 选择 AAC 格式
   - 点击"开始转换"
   - 等待转换完成

4. **测试播放**
   - 转换完成后，点击播放按钮
   - 确认音频正常播放
   - 检查进度条和时间显示

5. **查看日志**
   ```bash
   adb logcat | grep -E "FFmpeg|ReactNativeJS"
   ```

---

### 2. 其他格式测试

测试所有格式的转换和播放：

| 格式 | 扩展名 | 测试状态 |
|------|--------|---------|
| MP3 | `.mp3` | ⚠️ 需要测试 |
| AAC | `.m4a` | ⚠️ 需要修复和测试 |
| OGG | `.ogg` | ⚠️ 需要测试 |
| FLAC | `.flac` | ⚠️ 需要测试 |
| WAV | `.wav` | ⚠️ 需要测试 |
| ALAC | `.alac` | ⚠️ 需要测试 |

---

## 📝 预期结果

### 修复前
- ❌ AAC 转换后无法播放
- ❌ 文件扩展名为 `.aac`
- ❌ 播放器无法识别

### 修复后
- ✅ AAC 转换后正常播放
- ✅ 文件扩展名为 `.m4a`
- ✅ 播放器正确识别
- ✅ 进度条和时间显示正常

---

## 🎯 总结

**最可能的原因**: AAC 格式使用了 `.aac` 扩展名，应该使用 `.m4a`

**推荐修复顺序**:
1. ✅ 修改 AAC 扩展名为 `.m4a`
2. ✅ 优化 FFmpeg AAC 编码命令
3. ✅ 添加文件完整性检查
4. ✅ 添加详细的 FFmpeg 日志

**预计修复时间**: 10-15 分钟

---

**最后更新**: 2026-08-05  
**版本**: v79  
**状态**: 🔴 待修复
