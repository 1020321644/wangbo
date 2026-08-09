# 🚀 快速启动指南

## 📋 前提条件

### 1. 安装 Android Studio
- 下载地址: https://developer.android.com/studio
- 安装后打开 SDK Manager（Tools → SDK Manager）
- 确保安装了：
  - ✅ Android SDK Platform 33 或更高
  - ✅ Android SDK Build-Tools
  - ✅ Android Emulator
  - ✅ Android SDK Platform-Tools

### 2. 创建 Android 虚拟设备（AVD）
1. 打开 Android Studio
2. Tools → Device Manager
3. 点击 "Create Device"
4. 选择设备型号（推荐：**Pixel 6** 或 **Pixel 7**）
5. 选择系统镜像（推荐：**Android 13, API 33**）
6. 点击 "Finish"

### 3. 设置环境变量

#### macOS / Linux
```bash
# 添加到 ~/.bashrc 或 ~/.zshrc
export ANDROID_HOME=$HOME/Library/Android/sdk  # macOS
# export ANDROID_HOME=$HOME/Android/Sdk        # Linux

export PATH=$PATH:$ANDROID_HOME/emulator
export PATH=$PATH:$ANDROID_HOME/platform-tools

# 重新加载配置
source ~/.bashrc  # 或 source ~/.zshrc
```

#### Windows (PowerShell)
```powershell
# 添加到系统环境变量
$env:ANDROID_HOME = "C:\Users\YourName\AppData\Local\Android\Sdk"
$env:Path += ";$env:ANDROID_HOME\emulator"
$env:Path += ";$env:ANDROID_HOME\platform-tools"
```

---

## 🚀 方法 1: 使用自动化脚本（推荐）

```bash
cd /workspace/app-dk2quyiid79d
bash tasks/run-on-emulator.sh
```

脚本会自动：
1. ✅ 检查 Android SDK 配置
2. ✅ 列出可用的 AVD
3. ✅ 检查模拟器状态
4. ✅ 清理并重新构建
5. ✅ 在模拟器上运行应用

---

## 🚀 方法 2: 手动步骤

### 步骤 1: 启动 Android 模拟器

#### 选项 A: 通过 Android Studio（最简单）
1. 打开 Android Studio
2. Tools → Device Manager
3. 点击设备旁边的 **▶️ 播放按钮**
4. 等待模拟器启动（30-60 秒）

#### 选项 B: 通过命令行
```bash
# 列出可用的 AVD
emulator -list-avds

# 启动模拟器（替换 AVD_NAME）
emulator -avd Pixel_6_API_33 &
```

### 步骤 2: 验证模拟器已启动

```bash
# 检查设备连接
adb devices

# 应该看到类似输出：
# List of devices attached
# emulator-5554    device
```

### 步骤 3: 构建并运行应用

```bash
cd /workspace/app-dk2quyiid79d

# 清理旧的构建
rm -rf android ios

# 生成原生代码
npx expo prebuild --clean

# 运行应用
npx expo run:android
```

---

## 🧪 测试功能

### 测试 1: 音频增强功能

1. **在应用中导航到** `/audio-enhance-test`
2. **选择音频文件**
   - 点击"选择音频文件"
   - 如果模拟器没有音频文件，从电脑拖拽一个到模拟器
3. **点击 "AI 超分模型（高质量）"**
4. **观察**：
   - ✅ 进度条从 0% 缓慢增长到 100%
   - ✅ 百分比显示为**白色字体**
   - ✅ 已用时间和剩余时间实时更新

### 测试 2: Android 系统内录功能

1. **在应用中导航到** `/android-audio-test`
2. **点击 "请求权限"**
   - 系统会弹出"开始录制屏幕内容"对话框
   - 点击"立即开始"
3. **点击 "开始录制"**
4. **播放一些音乐**（用于测试捕获）
5. **点击 "停止录制"**

---

## 📊 查看日志

### 实时查看所有日志
```bash
adb logcat
```

### 过滤音频处理日志
```bash
adb logcat | grep "processWithAI\|processWithFFmpeg"
```

### 过滤系统内录日志
```bash
adb logcat | grep "AudioCapture"
```

### 查看应用日志
```bash
adb logcat | grep "ReactNativeJS"
```

---

## 🐛 常见问题

### 问题 1: `emulator: command not found`

**解决方案**:
```bash
# 检查 ANDROID_HOME
echo $ANDROID_HOME

# 如果为空，设置环境变量
export ANDROID_HOME=$HOME/Library/Android/sdk  # macOS
export PATH=$PATH:$ANDROID_HOME/emulator
export PATH=$PATH:$ANDROID_HOME/platform-tools
```

### 问题 2: `adb: command not found`

**解决方案**:
```bash
# 添加 platform-tools 到 PATH
export PATH=$PATH:$ANDROID_HOME/platform-tools

# 验证
adb version
```

### 问题 3: 模拟器启动失败

**解决方案**:
```bash
# 检查可用的 AVD
emulator -list-avds

# 如果列表为空，在 Android Studio 中创建一个 AVD
# Tools → Device Manager → Create Device
```

### 问题 4: 应用安装失败

**解决方案**:
```bash
cd /workspace/app-dk2quyiid79d

# 完全清理
rm -rf android ios node_modules/.cache

# 重新安装依赖
pnpm install

# 重新构建
npx expo prebuild --clean
npx expo run:android
```

### 问题 5: 进度条一下子就跑完了

**原因**: 音频文件太短（< 30 秒）

**解决方案**:
- 使用 > 1 分钟的音频文件
- 使用 AI 超分处理（不是 FFmpeg）

---

## 📝 预期处理时间

| 音频时长 | FFmpeg DSP | AI 超分 |
|---------|-----------|---------|
| 30 秒 | 1-2 秒 | 8-15 秒 |
| 1 分钟 | 3-5 秒 | **15-30 秒** |
| 3 分钟 | 9-15 秒 | **45-90 秒** |
| 5 分钟 | 15-25 秒 | **75-150 秒** |

**注意**: 
- 实际处理时间取决于模拟器性能
- AI 超分使用了 10 个阶段的复杂滤镜链
- 处理时间是**真实的**，不是模拟的

---

## 🎯 验证处理是否真实

### 方法 1: 查看详细日志
```bash
adb logcat | grep "processWithAI"
```

**预期输出**:
```
[processWithAI] 🚀 开始 AI 超分处理...
[processWithAI] ⚠️ 使用超级复杂滤镜模拟 AI 效果
[processWithAI] ⏱️ 处理时间会比较长，请耐心等待...
[processWithAI] 🎯 进度: 12.3% | ⏱️ 已用: 3.2s | ⏳ 剩余: 22.8s
[processWithAI] 🎯 进度: 45.7% | ⏱️ 已用: 12.1s | ⏳ 剩余: 14.4s
[processWithAI] ✅ AI 超分处理成功
```

### 方法 2: 监控 CPU 使用率
```bash
adb shell top | grep ffmpeg
```

**预期**: FFmpeg 进程应该占用 50-100% CPU

---

## 🎉 成功标志

当您看到以下内容时，说明一切正常：

1. ✅ 模拟器成功启动
2. ✅ 应用成功安装并运行
3. ✅ 音频增强测试页面可以访问
4. ✅ 进度条显示白色字体
5. ✅ AI 超分处理时间明显更长（> 15 秒/分钟）
6. ✅ 控制台输出详细日志
7. ✅ Android 系统内录权限请求成功

---

## 📞 需要帮助？

如果遇到问题：
1. 查看上面的"常见问题"部分
2. 检查控制台日志：`adb logcat`
3. 确保使用 > 1 分钟的音频文件测试
4. 确保点击的是"AI 超分模型（高质量）"按钮

---

## 🚀 快速命令参考

```bash
# 启动模拟器
emulator -avd Pixel_6_API_33 &

# 检查设备
adb devices

# 构建并运行
cd /workspace/app-dk2quyiid79d
rm -rf android ios
npx expo prebuild --clean
npx expo run:android

# 查看日志
adb logcat | grep "processWithAI\|AudioCapture"
```
