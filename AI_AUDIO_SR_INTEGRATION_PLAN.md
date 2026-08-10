# 🎯 AI 音频超分辨率集成计划

## 📅 项目信息

**开始时间**: 2026-08-05  
**版本**: v79  
**目标**: 集成真实的 AI 音频超分辨率模块到母带增强功能

---

## 📋 必须包含的 3 个核心部分

### 1. ✅ AI 引擎（NPM 包）

**包名**: `onnxruntime-react-native`  
**版本**: `1.24.3`  
**状态**: ✅ **已安装**

```json
{
  "dependencies": {
    "onnxruntime-react-native": "^1.24.3"
  }
}
```

---

### 2. ❌ AI 模型文件（资源文件）

**文件名**: `AudioSR.onnx`  
**来源**: Hugging Face  
**目标位置**: `assets/audiosr.onnx`  
**状态**: ❌ **需要下载**

**下载步骤**:
1. 访问 Hugging Face: https://huggingface.co/
2. 搜索 "AudioSR" 或 "Audio Super Resolution"
3. 下载 `.onnx` 模型文件
4. 重命名为 `audiosr.onnx`（小写，符合 Android 资源命名规范）
5. 放到 `assets/` 目录

**备选方案**:
- 如果找不到 AudioSR.onnx，可以使用其他音频超分辨率模型
- 例如：`audio-super-resolution.onnx`、`audio-enhancement.onnx`

---

### 3. ❌ Kotlin 原生模块（翻译官）

**文件名**: `AudioSRModule.kt`  
**位置**: `android/app/src/main/java/com/audiophile/converter/AudioSRModule.kt`  
**状态**: ❌ **需要创建**

**功能**:
- 加载 ONNX 模型
- 执行 AI 推理
- 处理音频数据
- 返回增强后的音频

---

## 🔧 实现步骤

### 步骤 1: 下载 AudioSR.onnx 模型文件

**任务**:
1. 从 Hugging Face 下载 AudioSR 模型
2. 重命名为 `audiosr.onnx`
3. 放到 `assets/` 目录

**预期结果**:
```
assets/
  audiosr.onnx  ← 新增
  icon.png
  adaptive-icon.png
```

---

### 步骤 2: 创建 Kotlin 原生模块

**文件**: `android/app/src/main/java/com/audiophile/converter/AudioSRModule.kt`

**代码结构**:
```kotlin
package com.audiophile.converter

import ai.onnxruntime.*
import com.facebook.react.bridge.*
import java.io.File

class AudioSRModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    
    override fun getName(): String = "AudioSR"
    
    private var session: OrtSession? = null
    
    @ReactMethod
    fun loadModel(promise: Promise) {
        try {
            // 从 assets 加载模型
            val modelPath = "audiosr.onnx"
            val inputStream = reactApplicationContext.assets.open(modelPath)
            val modelBytes = inputStream.readBytes()
            inputStream.close()
            
            // 创建 ONNX Runtime 会话
            val env = OrtEnvironment.getEnvironment()
            session = env.createSession(modelBytes)
            
            promise.resolve("模型加载成功")
        } catch (e: Exception) {
            promise.reject("LOAD_MODEL_ERROR", e.message, e)
        }
    }
    
    @ReactMethod
    fun processAudio(inputPath: String, outputPath: String, promise: Promise) {
        try {
            if (session == null) {
                promise.reject("NO_MODEL", "模型未加载")
                return
            }
            
            // 读取音频数据
            val audioData = readAudioFile(inputPath)
            
            // 创建输入张量
            val inputTensor = OnnxTensor.createTensor(
                OrtEnvironment.getEnvironment(),
                audioData
            )
            
            // 执行推理
            val inputs = mapOf("input" to inputTensor)
            val outputs = session!!.run(inputs)
            
            // 获取输出
            val outputTensor = outputs[0].value as Array<FloatArray>
            
            // 保存增强后的音频
            writeAudioFile(outputPath, outputTensor)
            
            promise.resolve(outputPath)
        } catch (e: Exception) {
            promise.reject("PROCESS_ERROR", e.message, e)
        }
    }
    
    private fun readAudioFile(path: String): Array<FloatArray> {
        // TODO: 实现音频文件读取
        // 使用 Android AudioRecord 或 FFmpeg 读取音频数据
        return arrayOf()
    }
    
    private fun writeAudioFile(path: String, data: Array<FloatArray>) {
        // TODO: 实现音频文件写入
        // 使用 Android AudioTrack 或 FFmpeg 写入音频数据
    }
}
```

**注册模块**:
```kotlin
// android/app/src/main/java/com/audiophile/converter/AudioSRPackage.kt
package com.audiophile.converter

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class AudioSRPackage : ReactPackage {
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
        return listOf(AudioSRModule(reactContext))
    }
    
    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
        return emptyList()
    }
}
```

**在 MainApplication.kt 中注册**:
```kotlin
// android/app/src/main/java/com/audiophile/converter/MainApplication.kt
override fun getPackages(): List<ReactPackage> {
    return PackageList(this).packages.apply {
        add(AudioSRPackage())  // ← 新增
    }
}
```

---

### 步骤 3: 创建 TypeScript 桥接层

**文件**: `src/lib/audioSR.ts`

**代码**:
```typescript
import { NativeModules, Platform } from "react-native";

interface AudioSRModule {
  loadModel(): Promise<string>;
  processAudio(inputPath: string, outputPath: string): Promise<string>;
}

const AudioSR = NativeModules.AudioSR as AudioSRModule;

/**
 * 加载 AudioSR 模型
 */
export async function loadAudioSRModel(): Promise<void> {
  if (Platform.OS !== "android") {
    throw new Error("AudioSR 仅支持 Android 平台");
  }
  
  try {
    const result = await AudioSR.loadModel();
    console.log("[AudioSR] 模型加载成功:", result);
  } catch (error) {
    console.error("[AudioSR] 模型加载失败:", error);
    throw error;
  }
}

/**
 * 使用 AI 处理音频
 */
export async function processAudioWithAI(
  inputPath: string,
  outputPath: string,
  onProgress?: (progress: number) => void
): Promise<string> {
  if (Platform.OS !== "android") {
    throw new Error("AudioSR 仅支持 Android 平台");
  }
  
  try {
    console.log("[AudioSR] 开始 AI 处理...");
    console.log("[AudioSR] 输入文件:", inputPath);
    console.log("[AudioSR] 输出文件:", outputPath);
    
    // 模拟进度（真实实现需要在 Kotlin 中回调进度）
    if (onProgress) {
      onProgress(0);
      const progressInterval = setInterval(() => {
        const currentProgress = Math.random() * 100;
        onProgress(currentProgress);
      }, 500);
      
      const result = await AudioSR.processAudio(inputPath, outputPath);
      
      clearInterval(progressInterval);
      onProgress(100);
      
      console.log("[AudioSR] AI 处理完成:", result);
      return result;
    } else {
      const result = await AudioSR.processAudio(inputPath, outputPath);
      console.log("[AudioSR] AI 处理完成:", result);
      return result;
    }
  } catch (error) {
    console.error("[AudioSR] AI 处理失败:", error);
    throw error;
  }
}
```

---

### 步骤 4: 集成 AI 处理到母带增强

**文件**: `src/lib/audioEngine.ts`

**修改**:
```typescript
import { loadAudioSRModel, processAudioWithAI } from "./audioSR";

// 在应用启动时加载模型
export async function initAudioSR(): Promise<void> {
  try {
    await loadAudioSRModel();
    console.log("[AudioEngine] AudioSR 模型加载成功");
  } catch (error) {
    console.error("[AudioEngine] AudioSR 模型加载失败:", error);
  }
}

// 修改 runConvert 函数
export async function runConvert(
  sourceUri: string,
  sourceName: string,
  target: AudioFormat,
  params: ConvertParams,
  onProgress: (p: number, label: string) => void,
  sourceSize?: number,
): Promise<string> {
  // ...
  
  // 如果启用母带增强，使用 AI 处理
  if (params.masterEnhance && Platform.OS === "android") {
    try {
      console.log("[AudioEngine] 使用 AI 处理音频...");
      
      // 先用 FFmpeg 转换格式
      const tempUri = `${cacheDir}temp_${outName}`;
      await FFmpegKit.execute(`-i "${sourceUri}" -ar 48000 "${tempUri}"`);
      
      // 再用 AI 增强
      await processAudioWithAI(tempUri, outUri, (progress) => {
        onProgress(progress / 100, "AI 音频超分辨率处理中...");
      });
      
      // 删除临时文件
      await FileSystem.deleteAsync(tempUri, { idempotent: true });
      
      console.log("[AudioEngine] AI 处理完成");
    } catch (error) {
      console.error("[AudioEngine] AI 处理失败，降级为 FFmpeg:", error);
      // 降级为 FFmpeg 处理
      await FFmpegKit.execute(cmd);
    }
  } else {
    // 使用 FFmpeg 处理
    await FFmpegKit.execute(cmd);
  }
  
  // ...
}
```

---

### 步骤 5: 在应用启动时加载模型

**文件**: `src/app/_layout.tsx`

**修改**:
```typescript
import { initAudioSR } from "@/lib/audioEngine";

export default function RootLayout() {
  useEffect(() => {
    // 加载 AudioSR 模型
    initAudioSR().catch((error) => {
      console.error("AudioSR 模型加载失败:", error);
    });
  }, []);
  
  // ...
}
```

---

## 🧪 测试步骤

### 1. 测试模型加载

**步骤**:
1. 启动应用
2. 查看日志：`adb logcat | grep AudioSR`
3. 确认模型加载成功

**预期日志**:
```
[AudioSR] 模型加载成功: 模型加载成功
[AudioEngine] AudioSR 模型加载成功
```

---

### 2. 测试 AI 处理

**步骤**:
1. 选择一个音频文件
2. 选择"母带级提升"模式
3. 选择目标格式（例如 FLAC）
4. 点击"开始转换"
5. 观察进度条和日志

**预期日志**:
```
[AudioEngine] 使用 AI 处理音频...
[AudioSR] 开始 AI 处理...
[AudioSR] 输入文件: file://...
[AudioSR] 输出文件: file://...
[AudioSR] AI 处理完成: file://...
[AudioEngine] AI 处理完成
```

---

### 3. 对比效果

**步骤**:
1. 准备一个低质量音频文件
2. 分别使用"格式转换"和"母带级提升"处理
3. 对比两个输出文件的音质

**预期结果**:
- "格式转换": 使用 FFmpeg 滤镜
- "母带级提升": 使用 AI 超分辨率
- AI 处理的音质应该明显优于 FFmpeg 滤镜

---

## ⚠️ 注意事项

### 1. 模型文件大小

**问题**: AudioSR 模型文件可能很大（几十 MB 到几百 MB）

**解决方案**:
- 压缩模型（量化）
- 使用轻量级模型
- 首次启动时下载模型（而不是打包到 APK）

---

### 2. 推理性能

**问题**: AI 推理可能很慢（几秒到几十秒）

**解决方案**:
- 使用 GPU 加速（ONNX Runtime 支持）
- 优化模型（剪枝、量化）
- 显示详细的进度条

---

### 3. iOS 支持

**问题**: 当前实现仅支持 Android

**解决方案**:
- 创建 Swift 原生模块（类似 Kotlin）
- 使用 ONNX Runtime iOS SDK
- 或者使用 Core ML 转换模型

---

## 📊 预期效果

### 修复前（FFmpeg 滤镜）

**处理时间**: 约 10-30 秒  
**音质提升**: 中等  
**用户体验**: 良好  

---

### 修复后（AI 超分辨率）

**处理时间**: 约 30-60 秒  
**音质提升**: 显著  
**用户体验**: 优秀  

---

## 🎯 总结

### 必须完成的 3 个核心部分

1. ✅ **AI 引擎（NPM 包）**: `onnxruntime-react-native@1.24.3` - 已安装
2. ❌ **AI 模型文件**: `AudioSR.onnx` - 需要下载
3. ❌ **Kotlin 原生模块**: `AudioSRModule.kt` - 需要创建

### 预计工作量

- **下载模型**: 10 分钟
- **创建 Kotlin 模块**: 1-2 小时
- **创建 TypeScript 桥接**: 30 分钟
- **集成到母带增强**: 30 分钟
- **测试和调试**: 1-2 小时

**总计**: 3-5 小时

---

**最后更新**: 2026-08-05  
**版本**: v79  
**状态**: 🔴 待实现
