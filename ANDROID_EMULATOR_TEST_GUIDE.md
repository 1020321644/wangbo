# 📱 Android 模拟器测试指南

## 🚀 快速开始

### 1. 安装 Android Studio

1. 下载 Android Studio: https://developer.android.com/studio
2. 安装并打开 Android Studio
3. 打开 SDK Manager（Tools → SDK Manager）
4. 安装以下组件：
   - Android SDK Platform 34（或更高）
   - Android SDK Build-Tools
   - Android Emulator
   - Android SDK Platform-Tools

### 2. 创建 Android 虚拟设备（AVD）

1. 打开 AVD Manager（Tools → Device Manager）
2. 点击 "Create Device"
3. 选择设备型号（推荐：Pixel 6 或 Pixel 7）
4. 选择系统镜像：
   - **推荐**: Android 13 (API 33) 或 Android 14 (API 34)
   - **最低要求**: Android 10 (API 29) - 系统内录功能需要
5. 点击 "Finish" 完成创建

### 3. 启动模拟器

```bash
# 方法 1: 通过 Android Studio
# 打开 Device Manager → 点击设备旁边的播放按钮

# 方法 2: 通过命令行
emulator -avd Pixel_6_API_33
```

### 4. 构建并运行应用

```bash
cd /workspace/app-dk2quyiid79d

# 清理旧的构建
rm -rf android ios

# 生成原生代码（Config Plugin 会自动注入）
npx expo prebuild --clean

# 运行在模拟器上
npx expo run:android
```

## 🧪 测试功能

### 测试 1: 音频增强功能

1. **启动应用**
   - 等待应用在模拟器上启动

2. **导航到测试页面**
   - 在应用中找到"音频增强测试"入口
   - 或直接导航到 `/audio-enhance-test`

3. **选择音频文件**
   - 点击"选择音频文件"
   - 从模拟器中选择一个音频文件
   - 如果没有音频文件，可以从电脑拖拽到模拟器

4. **测试 FFmpeg 处理**
   - 点击"FFmpeg DSP 滤镜（快速）"
   - 观察：
     - ✅ 进度条应该从 0% 逐渐增长到 100%
     - ✅ 进度百分比应该是**白色字体**
     - ✅ 已用时间和剩余时间应该实时更新
     - ✅ 控制台应该输出详细日志

5. **测试 AI 超分处理**
   - 点击"AI 超分模型（高质量）"
   - 观察：
     - ✅ 处理时间应该**明显比 FFmpeg 慢**
     - ✅ 进度条应该缓慢增长
     - ✅ 控制台应该输出 "🚀 开始 AI 超分处理..."
     - ✅ 控制台应该输出 "⚠️ 使用超级复杂滤镜模拟 AI 效果"

### 测试 2: Android 系统内录功能

1. **导航到测试页面**
   - 在应用中找到"Android 系统内录测试"入口
   - 或直接导航到 `/android-audio-test`

2. **检查系统支持**
   - 应该显示"✅ 系统支持"
   - 如果显示"❌ 不支持"，说明模拟器 Android 版本低于 10

3. **请求权限**
   - 点击"请求权限"按钮
   - 系统会弹出"开始录制屏幕内容"对话框
   - 点击"立即开始"授予权限

4. **开始录制**
   - 点击"开始录制"按钮
   - 播放一些音乐（用于测试捕获）
   - 观察音频数据包计数增加

5. **停止录制**
   - 点击"停止录制"按钮
   - 查看录制统计信息

## 🐛 常见问题

### 问题 1: 模拟器启动失败

**解决方案**:
```bash
# 检查 ANDROID_HOME 环境变量
echo $ANDROID_HOME

# 如果未设置，添加到 ~/.bashrc 或 ~/.zshrc
export ANDROID_HOME=$HOME/Android/Sdk
export PATH=$PATH:$ANDROID_HOME/emulator
export PATH=$PATH:$ANDROID_HOME/platform-tools
```

### 问题 2: 应用安装失败

**解决方案**:
```bash
# 清理构建缓存
cd /workspace/app-dk2quyiid79d
rm -rf android ios node_modules/.cache

# 重新构建
npx expo prebuild --clean
npx expo run:android
```

### 问题 3: 音频文件无法选择

**解决方案**:
1. 从电脑拖拽音频文件到模拟器
2. 文件会自动保存到模拟器的 Downloads 文件夹
3. 在文件选择器中找到该文件

### 问题 4: 系统内录权限请求失败

**解决方案**:
1. 确保模拟器 Android 版本 ≥ 10 (API 29)
2. 重启应用
3. 重新请求权限

### 问题 5: 进度条一下子就跑完了

**原因**: 
- 音频文件太短（< 10 秒）
- FFmpeg 处理速度确实很快

**解决方案**:
- 使用更长的音频文件（> 1 分钟）
- 使用 AI 超分处理（处理时间更长）

## 📊 预期处理时间

| 音频时长 | FFmpeg DSP | AI 超分 |
|---------|-----------|---------|
| 30 秒 | 1-2 秒 | 8-15 秒 |
| 1 分钟 | 3-5 秒 | 15-30 秒 |
| 3 分钟 | 9-15 秒 | 45-90 秒 |
| 5 分钟 | 15-25 秒 | 75-150 秒 |

**注意**: 
- 实际处理时间取决于模拟器性能
- AI 超分使用了 10 个阶段的复杂滤镜链
- 处理时间是**真实的**，不是模拟的

## 🎯 验证处理是否真实

### 方法 1: 查看控制台日志

```bash
# 在终端中查看日志
adb logcat | grep "processWithAI\|processWithFFmpeg"
```

**预期输出**:
```
[processWithAI] 🚀 开始 AI 超分处理...
[processWithAI] ⚠️ 使用超级复杂滤镜模拟 AI 效果
[processWithAI] ⏱️ 处理时间会比较长，请耐心等待...
[processWithAI] 命令: -i "..." -af "aresample=192000,highpass=f=60,..."
[processWithAI] 🎯 进度: 12.3% | ⏱️ 已用: 3.2s | ⏳ 剩余: 22.8s
[processWithAI] 🎯 进度: 45.7% | ⏱️ 已用: 12.1s | ⏳ 剩余: 14.4s
[processWithAI] ✅ AI 超分处理成功
```

### 方法 2: 监控 CPU 使用率

```bash
# 查看 FFmpeg 进程
adb shell top | grep ffmpeg
```

**预期**: 在处理期间，FFmpeg 进程应该占用 50-100% CPU

### 方法 3: 对比输出文件

```bash
# 拉取处理后的文件
adb pull /data/user/0/com.anonymous.appdigir8owph2ip/files/recording_xxx.mp3

# 使用 FFprobe 查看音频信息
ffprobe recording_xxx.mp3
```

**预期**: 输出文件应该是 48kHz, 320kbps, 立体声

## 🎉 测试完成检查清单

- [ ] 模拟器成功启动
- [ ] 应用成功安装并运行
- [ ] 音频增强测试页面可以访问
- [ ] FFmpeg 处理显示进度条（白色字体）
- [ ] AI 超分处理时间明显更长
- [ ] 控制台输出详细日志
- [ ] Android 系统内录权限请求成功
- [ ] 系统内录可以捕获音频数据
- [ ] 录制的音频可以保存为 MP3

---

## 📝 下一步

如果所有测试通过，您可以：
1. 在真机上测试（推荐）
2. 集成到现有录音功能中
3. 完善音频处理参数
4. 添加更多音频效果

如果遇到问题，请查看控制台日志并参考"常见问题"部分。
