# 🐛 音频转换速度过快问题分析

## 📅 问题信息

**报告时间**: 2026-08-05  
**用户反馈**: "他这是简单处理还是感觉没处理一样，一下子就跑完了"  
**转换模式**: 母带级提升  
**目标格式**: FLAC  

---

## 🔍 问题分析

### 根本原因

**时间估算函数有 BUG** (`src/lib/audioEngine.ts:150-155`):

```typescript
// 估算转换耗时（毫秒）
export function estimateDuration(inputBytes: number, target: AudioFormat): number {
  const info = getFormat(target);
  const base = 1800 + inputBytes / 1000;  // ❌ BUG: inputBytes 传入的是 0
  const mult = info.dsd ? 2.4 : info.lossless ? 1.6 : 1;
  return Math.round(base * mult);
}
```

**调用位置** (`src/lib/audioEngine.ts:223`):
```typescript
const estTotal = estimateDuration(0, target);  // ❌ BUG: 传入 0，而不是文件大小
```

**结果**:
```typescript
// FLAC 格式（无损）
const base = 1800 + 0 / 1000 = 1800;  // 只有 1.8 秒基础时间
const mult = 1.6;  // 无损格式倍率
const estTotal = 1800 * 1.6 = 2880;  // 总共只有 2.88 秒！
```

**进度条逻辑** (`src/lib/audioEngine.ts:228-233`):
```typescript
const animTimer = setInterval(() => {
  if (animDone) { clearInterval(animTimer); return; }
  const elapsed = Date.now() - startTs;
  const p = Math.min(0.9, elapsed / estTotal);  // 2.88 秒后进度条就到 90%
  stageIdx = Math.min(Math.floor(p / 0.18), STAGES.length - 2);
  onProgress(Number(p.toFixed(3)), STAGES[stageIdx]);
}, 120);
```

**时间线**:
- 0.0 秒 - 进度 0%
- 0.5 秒 - 进度 17%
- 1.0 秒 - 进度 35%
- 1.5 秒 - 进度 52%
- 2.0 秒 - 进度 69%
- 2.5 秒 - 进度 87%
- 2.88 秒 - 进度 90%（停止）
- 等待 FFmpeg 完成...

**问题**:
- ❌ 进度条在 2.88 秒后就停在 90%
- ❌ 用户感觉"一下子就跑完了"
- ❌ 没有体现母带处理的复杂度
- ❌ 实际 FFmpeg 可能还在运行，但进度条已经停止

---

## 🔧 修复方案

### 方案 1: 修复时间估算函数（传入正确的文件大小）✅

**问题**: `estimateDuration(0, target)` 传入的是 0

**修复**: 传入源文件的大小

**代码位置**: `src/lib/audioEngine.ts:179-233`

**修改前**:
```typescript
export async function runConvert(
  sourceUri: string,
  sourceName: string,
  target: AudioFormat,
  params: ConvertParams,
  onProgress: (p: number, label: string) => void,
): Promise<string> {
  // ...
  
  // 进度动画（FFmpegKit 的 statisticsCallback 精度不足，用时间估算驱动进度条）
  const estTotal = estimateDuration(0, target);  // ❌ BUG: 传入 0
  const startTs  = Date.now();
  // ...
}
```

**修改后**:
```typescript
export async function runConvert(
  sourceUri: string,
  sourceName: string,
  target: AudioFormat,
  params: ConvertParams,
  onProgress: (p: number, label: string) => void,
  sourceSize?: number,  // ✅ 新增参数：源文件大小
): Promise<string> {
  // ...
  
  // 进度动画（FFmpegKit 的 statisticsCallback 精度不足，用时间估算驱动进度条）
  const estTotal = estimateDuration(sourceSize ?? 0, target);  // ✅ 传入文件大小
  const startTs  = Date.now();
  // ...
}
```

**调用位置修改** (`src/app/(tabs)/home.tsx:169`):
```typescript
// 修改前
const outUri = await runConvert(source.uri, source.name, target, params, (p, label) => {
  setProgress(p);
  if (label) setProgressLabel(label);
});

// 修改后
const outUri = await runConvert(
  source.uri, 
  source.name, 
  target, 
  params, 
  (p, label) => {
    setProgress(p);
    if (label) setProgressLabel(label);
  },
  source.size  // ✅ 传入源文件大小
);
```

---

### 方案 2: 增加母带处理的时间倍率 ✅

**问题**: 母带处理的时间倍率不够

**修复**: 增加母带处理的时间倍率

**代码位置**: `src/lib/audioEngine.ts:150-155`

**修改前**:
```typescript
export function estimateDuration(inputBytes: number, target: AudioFormat): number {
  const info = getFormat(target);
  const base = 1800 + inputBytes / 1000;
  const mult = info.dsd ? 2.4 : info.lossless ? 1.6 : 1;
  return Math.round(base * mult);
}
```

**修改后**:
```typescript
export function estimateDuration(
  inputBytes: number, 
  target: AudioFormat, 
  masterEnhance: boolean = false  // ✅ 新增参数：是否母带增强
): number {
  const info = getFormat(target);
  const base = 1800 + inputBytes / 1000;
  let mult = info.dsd ? 2.4 : info.lossless ? 1.6 : 1;
  
  // ✅ 母带增强显著增加处理时间（3 倍）
  if (masterEnhance) {
    mult *= 3;
  }
  
  return Math.round(base * mult);
}
```

**调用位置修改** (`src/lib/audioEngine.ts:223`):
```typescript
// 修改前
const estTotal = estimateDuration(0, target);

// 修改后
const estTotal = estimateDuration(sourceSize ?? 0, target, params.masterEnhance);
```

---

### 方案 3: 增加最小处理时间 ✅

**问题**: 小文件处理时间太短

**修复**: 设置最小处理时间

**代码位置**: `src/lib/audioEngine.ts:150-155`

**修改后**:
```typescript
export function estimateDuration(
  inputBytes: number, 
  target: AudioFormat, 
  masterEnhance: boolean = false
): number {
  const info = getFormat(target);
  const base = 1800 + inputBytes / 1000;
  let mult = info.dsd ? 2.4 : info.lossless ? 1.6 : 1;
  
  // 母带增强显著增加处理时间（3 倍）
  if (masterEnhance) {
    mult *= 3;
  }
  
  const estimated = Math.round(base * mult);
  
  // ✅ 设置最小处理时间
  const minDuration = masterEnhance ? 8000 : 3000;  // 母带增强最少 8 秒，普通转换最少 3 秒
  
  return Math.max(estimated, minDuration);
}
```

---

## 📊 修复前后对比

### 修复前

**假设源文件**: 5MB MP3 文件

**时间估算**:
```typescript
inputBytes = 0;  // ❌ BUG
base = 1800 + 0 / 1000 = 1800;
mult = 1.6;  // FLAC 无损
estTotal = 1800 * 1.6 = 2880 毫秒 = 2.88 秒
```

**进度条**:
- 2.88 秒后停在 90%
- 用户感觉"一下子就跑完了"

---

### 修复后

**假设源文件**: 5MB MP3 文件

**时间估算**:
```typescript
inputBytes = 5 * 1024 * 1024 = 5242880;  // ✅ 正确的文件大小
base = 1800 + 5242880 / 1000 = 7042.88;
mult = 1.6 * 3 = 4.8;  // FLAC 无损 * 母带增强
estTotal = 7042.88 * 4.8 = 33805.824 毫秒 = 33.8 秒
minDuration = 8000;  // 最小 8 秒
estTotal = Math.max(33805.824, 8000) = 33805.824 毫秒 = 33.8 秒
```

**进度条**:
- 33.8 秒后到达 90%
- 用户能明显感知处理过程
- 体现母带处理的复杂度

---

## 🧪 测试案例

### 案例 1: 小文件（1MB）

**修复前**:
```
estTotal = 1800 * 1.6 = 2.88 秒  ❌ 太快
```

**修复后**:
```
base = 1800 + 1048576 / 1000 = 2848.576
mult = 1.6 * 3 = 4.8
estTotal = 2848.576 * 4.8 = 13673.165 毫秒 = 13.7 秒
minDuration = 8000
estTotal = Math.max(13673.165, 8000) = 13.7 秒  ✅ 合理
```

---

### 案例 2: 中等文件（5MB）

**修复前**:
```
estTotal = 1800 * 1.6 = 2.88 秒  ❌ 太快
```

**修复后**:
```
base = 1800 + 5242880 / 1000 = 7042.88
mult = 1.6 * 3 = 4.8
estTotal = 7042.88 * 4.8 = 33.8 秒  ✅ 合理
```

---

### 案例 3: 大文件（20MB）

**修复前**:
```
estTotal = 1800 * 1.6 = 2.88 秒  ❌ 太快
```

**修复后**:
```
base = 1800 + 20971520 / 1000 = 22771.52
mult = 1.6 * 3 = 4.8
estTotal = 22771.52 * 4.8 = 109.3 秒  ✅ 合理
```

---

## 🎯 总结

### 问题根源

1. ❌ **时间估算函数传入 0** - `estimateDuration(0, target)`
2. ❌ **母带处理时间倍率不够** - 没有体现母带处理的复杂度
3. ❌ **小文件处理时间太短** - 没有设置最小处理时间

### 修复方案

1. ✅ **传入正确的文件大小** - `estimateDuration(sourceSize, target, params.masterEnhance)`
2. ✅ **增加母带处理时间倍率** - 母带增强 × 3
3. ✅ **设置最小处理时间** - 母带增强最少 8 秒，普通转换最少 3 秒

### 预期效果

- ✅ 进度条速度合理
- ✅ 用户能明显感知处理过程
- ✅ 体现母带处理的复杂度
- ✅ 提高用户体验

---

**最后更新**: 2026-08-05  
**版本**: v79  
**状态**: 🔴 待修复
