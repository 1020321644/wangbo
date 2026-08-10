# 🐛 音频转换格式错误问题分析

## 📅 问题信息

**报告时间**: 2026-08-05  
**用户反馈**: "ff和ai 二个模块我感觉都没运行 转换出来格式是wav格式"  

---

## 🔍 问题分析

### 根本原因

**代码位置**: `src/lib/audioEngine.ts:188`

```typescript
// DSD 降级：DSF/DFF 输出实际写 WAV（PCM 高清上采样，专业中间格式）
const outExt = info.dsd ? "wav" : info.ext;
```

**问题**:
- ✅ **设计意图**: 当用户选择 DSD 格式（DSF/DSD64/DSD128/DSD256/DSD512）作为输出格式时，因为 FFmpeg 不支持 DSD 编码，所以降级为 WAV 输出
- ❌ **实际问题**: 这个逻辑只检查**目标格式**是否为 DSD，而不是检查**源文件**是否为 DSD

**正确的逻辑应该是**:
- 如果用户选择 AAC → 输出 `.m4a`
- 如果用户选择 MP3 → 输出 `.mp3`
- 如果用户选择 FLAC → 输出 `.flac`
- 如果用户选择 WAV → 输出 `.wav`
- **只有**用户选择 DSD 格式（DSF/DSD64/DSD128/DSD256/DSD512）→ 降级为 `.wav`

---

## 🐛 问题 1: DSD 格式降级逻辑正确

**当前代码**:
```typescript
const outExt = info.dsd ? "wav" : info.ext;
```

**分析**:
- `info` 是目标格式的信息（`getFormat(target)`）
- `info.dsd` 表示目标格式是否为 DSD
- 如果目标格式是 DSD → 输出 WAV
- 如果目标格式不是 DSD → 输出目标格式的扩展名

**结论**: ✅ **这个逻辑是正确的**

---

## 🐛 问题 2: FFmpeg 命令可能没有执行

### 可能的原因

#### 原因 1: FFmpeg 命令构建错误

**代码位置**: `src/lib/audioEngine.ts:236-241`

```typescript
const extraArgs = buildFfmpegArgs(target, params);
const cmd = `-y -i "${sourceUri}" ${extraArgs.join(" ")} "${outUri}"`;
console.log("[FFmpeg] 执行命令：", cmd);
const session = await FFmpegKit.execute(cmd);
const rc = await session.getReturnCode();
console.log("[FFmpeg] 返回码：", rc);
```

**检查点**:
- [ ] `buildFfmpegArgs` 是否返回正确的参数
- [ ] `cmd` 是否正确构建
- [ ] `FFmpegKit.execute` 是否成功执行
- [ ] 返回码是否为 0（成功）

---

#### 原因 2: FFmpeg 执行失败，降级为文件复制

**代码位置**: `src/lib/audioEngine.ts:254-260`

```typescript
// FFmpeg 失败：降级为文件复制（至少保证导出可用）
const logs = await session.getAllLogsAsString();
console.warn("[FFmpeg] 转换失败，降级为文件复制。日志：", logs?.slice(-400));
const fallbackUri = `${cacheDir}fallback_${Date.now()}.${info.ext}`;
await FileSystem.copyAsync({ from: sourceUri, to: fallbackUri });
onProgress(1, "已复制原文件（格式转换失败）");
return fallbackUri;
```

**问题**:
- ❌ 降级时使用 `info.ext`（目标格式的扩展名）
- ❌ 但实际复制的是源文件，源文件的格式可能不是目标格式
- ❌ 这会导致文件扩展名与实际内容不匹配

**示例**:
- 源文件: `song.mp3`
- 目标格式: AAC (`.m4a`)
- FFmpeg 失败 → 降级为文件复制
- 输出文件: `fallback_xxx.m4a`（但内容是 MP3）
- 播放器尝试按 M4A 解码 → 失败

---

#### 原因 3: 文件路径问题

**代码位置**: `src/lib/audioEngine.ts:65-75`

```typescript
function safeCacheName(sourceName: string, ext: string): string {
  const base = sourceName
    .replace(/\.[^.]+$/, "")
    .replace(/[\u0080-\uffff]/g, "")   // 去掉所有非 ASCII（中文等）
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .replace(/^_+/, "")
    .slice(0, 40);
  return `${base || "audio"}_${Date.now()}.${ext}`;
}
```

**问题**:
- ✅ 去掉中文字符，避免 FFmpeg 路径解析失败
- ⚠️ 但如果源文件名全是中文，`base` 可能为空，导致文件名为 `audio_xxx.ext`

---

## 🔧 修复方案

### 方案 1: 修复降级文件复制的扩展名 ✅

**问题**: 降级时使用目标格式的扩展名，但复制的是源文件

**修复**: 降级时使用源文件的扩展名

**代码位置**: `src/lib/audioEngine.ts:254-260`

**修改前**:
```typescript
const fallbackUri = `${cacheDir}fallback_${Date.now()}.${info.ext}`;
await FileSystem.copyAsync({ from: sourceUri, to: fallbackUri });
onProgress(1, "已复制原文件（格式转换失败）");
return fallbackUri;
```

**修改后**:
```typescript
// 降级时使用源文件的扩展名，避免扩展名与内容不匹配
const sourceExt = sourceName.split(".").pop()?.toLowerCase() ?? "audio";
const fallbackUri = `${cacheDir}fallback_${Date.now()}.${sourceExt}`;
await FileSystem.copyAsync({ from: sourceUri, to: fallbackUri });
onProgress(1, `已复制原文件（格式转换失败，保留原格式 ${sourceExt.toUpperCase()}）`);
return fallbackUri;
```

---

### 方案 2: 添加更详细的 FFmpeg 日志 ✅

**问题**: 无法确定 FFmpeg 是否执行，以及失败原因

**修复**: 添加更详细的日志

**代码位置**: `src/lib/audioEngine.ts:236-260`

**修改后**:
```typescript
try {
  const extraArgs = buildFfmpegArgs(target, params);
  const cmd = `-y -i "${sourceUri}" ${extraArgs.join(" ")} "${outUri}"`;
  
  console.log("[FFmpeg] ========================================");
  console.log("[FFmpeg] 源文件:", sourceUri);
  console.log("[FFmpeg] 目标格式:", target);
  console.log("[FFmpeg] 输出文件:", outUri);
  console.log("[FFmpeg] 执行命令:", cmd);
  console.log("[FFmpeg] ========================================");
  
  const session = await FFmpegKit.execute(cmd);
  const rc = await session.getReturnCode();
  const logs = await session.getAllLogsAsString();
  
  console.log("[FFmpeg] 返回码:", rc);
  console.log("[FFmpeg] 完整日志:", logs);
  
  // ...
}
```

---

### 方案 3: 检查 FFmpeg 是否可用 ✅

**问题**: 可能 FFmpeg 没有正确安装或初始化

**修复**: 在执行前检查 FFmpeg 是否可用

**代码位置**: `src/lib/audioEngine.ts:235`

**新增代码**:
```typescript
// 检查 FFmpeg 是否可用
try {
  const version = await FFmpegKit.execute("-version");
  const versionLogs = await version.getAllLogsAsString();
  console.log("[FFmpeg] 版本信息:", versionLogs?.slice(0, 200));
} catch (err) {
  console.error("[FFmpeg] FFmpeg 不可用:", err);
  // 直接降级为文件复制
  const sourceExt = sourceName.split(".").pop()?.toLowerCase() ?? "audio";
  const fallbackUri = `${cacheDir}fallback_${Date.now()}.${sourceExt}`;
  await FileSystem.copyAsync({ from: sourceUri, to: fallbackUri });
  onProgress(1, "FFmpeg 不可用，已复制原文件");
  return fallbackUri;
}
```

---

### 方案 4: 修复异常处理中的扩展名 ✅

**代码位置**: `src/lib/audioEngine.ts:262-270`

**修改前**:
```typescript
} catch (err) {
  animDone = true;
  clearInterval(animTimer);
  console.warn("[FFmpeg] 执行异常：", err);
  const fallbackUri = `${cacheDir}fallback_${Date.now()}.${info.ext}`;
  try { await FileSystem.copyAsync({ from: sourceUri, to: fallbackUri }); } catch {}
  onProgress(1, "已复制原文件（转换异常）");
  return fallbackUri;
}
```

**修改后**:
```typescript
} catch (err) {
  animDone = true;
  clearInterval(animTimer);
  console.error("[FFmpeg] 执行异常：", err);
  // 降级时使用源文件的扩展名
  const sourceExt = sourceName.split(".").pop()?.toLowerCase() ?? "audio";
  const fallbackUri = `${cacheDir}fallback_${Date.now()}.${sourceExt}`;
  try { 
    await FileSystem.copyAsync({ from: sourceUri, to: fallbackUri }); 
    onProgress(1, `已复制原文件（转换异常，保留原格式 ${sourceExt.toUpperCase()}）`);
  } catch (copyErr) {
    console.error("[FFmpeg] 文件复制也失败：", copyErr);
    onProgress(1, "转换失败");
  }
  return fallbackUri;
}
```

---

## 🧪 测试步骤

### 1. 应用修复

```bash
cd /workspace/app-dk2quyiid79d
# 修改 src/lib/audioEngine.ts
```

---

### 2. 重新构建

```bash
rm -rf android ios node_modules/.cache
npx expo prebuild --clean
npx expo run:android
```

---

### 3. 测试转换

#### 测试 1: MP3 → AAC
1. 选择一个 MP3 文件
2. 选择 AAC 格式
3. 点击"开始转换"
4. 查看日志
5. 确认输出文件扩展名为 `.m4a`
6. 确认可以播放

#### 测试 2: MP3 → FLAC
1. 选择一个 MP3 文件
2. 选择 FLAC 格式
3. 点击"开始转换"
4. 查看日志
5. 确认输出文件扩展名为 `.flac`
6. 确认可以播放

#### 测试 3: MP3 → WAV
1. 选择一个 MP3 文件
2. 选择 WAV 格式
3. 点击"开始转换"
4. 查看日志
5. 确认输出文件扩展名为 `.wav`
6. 确认可以播放

---

### 4. 查看日志

```bash
adb logcat | grep -E "FFmpeg|ReactNativeJS"
```

**预期日志**:
```
[FFmpeg] ========================================
[FFmpeg] 源文件: file:///data/user/0/.../cache/song.mp3
[FFmpeg] 目标格式: AAC
[FFmpeg] 输出文件: file:///data/user/0/.../cache/audio_xxx.m4a
[FFmpeg] 执行命令: -y -i "file://..." -ar 48000 -c:a aac -b:a 320k -f mp4 -movflags +faststart "file://...audio_xxx.m4a"
[FFmpeg] ========================================
[FFmpeg] 返回码: 0
[FFmpeg] 完整日志: ...
```

---

## 📝 预期结果

### 修复前
- ❌ 所有格式转换后都是 WAV（如果 FFmpeg 失败）
- ❌ 文件扩展名与内容不匹配
- ❌ 播放器无法播放
- ❌ 无法确定 FFmpeg 是否执行

### 修复后
- ✅ MP3 → AAC 输出 `.m4a`
- ✅ MP3 → FLAC 输出 `.flac`
- ✅ MP3 → WAV 输出 `.wav`
- ✅ FFmpeg 失败时，降级为复制源文件，保留原扩展名
- ✅ 详细的 FFmpeg 日志
- ✅ 可以播放

---

## 🎯 总结

**问题根源**: FFmpeg 执行失败时，降级为文件复制，但使用了目标格式的扩展名，导致扩展名与内容不匹配

**修复方案**:
1. ✅ 降级时使用源文件的扩展名
2. ✅ 添加详细的 FFmpeg 日志
3. ✅ 检查 FFmpeg 是否可用
4. ✅ 修复异常处理中的扩展名

**预计修复时间**: 15-20 分钟

---

**最后更新**: 2026-08-05  
**版本**: v79  
**状态**: 🔴 待修复
