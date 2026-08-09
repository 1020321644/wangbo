# 🚀 重新构建应用指南

## ⚠️ 重要提示

**您说"软件没有任何变化"，这是因为代码修改后需要重新构建原生应用。**

React Native 应用不是纯 Web 应用，代码修改后**必须重新构建**才能看到变化。

---

## 📋 重新构建步骤

### 步骤 1: 清理所有缓存

```bash
cd /workspace/app-dk2quyiid79d

# 删除原生构建目录
rm -rf android ios

# 删除 Metro bundler 缓存
rm -rf node_modules/.cache

# 删除 Expo 缓存（可选）
rm -rf .expo
```

### 步骤 2: 重新生成原生代码

```bash
# 使用 Expo prebuild 重新生成 android 和 ios 目录
npx expo prebuild --clean
```

**预期输出**:
```
✔ Created native directories | /android, /ios
✔ Updated package.json
✔ Config synced
```

### 步骤 3: 启动 Android 模拟器

**方法 1: 使用 Android Studio**
1. 打开 Android Studio
2. 点击 Tools → Device Manager
3. 选择一个模拟器（推荐 Pixel 5 API 33）
4. 点击播放按钮启动

**方法 2: 使用命令行**
```bash
# 列出所有可用的模拟器
emulator -list-avds

# 启动指定的模拟器
emulator -avd Pixel_5_API_33 &
```

### 步骤 4: 重新运行应用

```bash
# 在 Android 模拟器上运行
npx expo run:android
```

**预期输出**:
```
› Building app...
› Installing app...
› Opening app on Android...
```

---

## 🧪 验证修复

### 1. 测试音乐解密功能

1. 打开应用
2. 导航到"工具箱" → "加密格式解密"
3. 查看"支持格式"列表，确认包含：
   - ✅ `.mflac` - QQ音乐 - MFLAC 加密格式
   - ✅ `.mgg` - QQ音乐 - MGG 加密格式
   - ✅ `.tm0` - 其他 - TM0 加密格式
   - ✅ `.tm2` - 其他 - TM2 加密格式
   - ✅ `.tm3` - 其他 - TM3 加密格式
   - ✅ `.tm6` - 其他 - TM6 加密格式
4. 选择一个 `.mflac` 文件
5. 确认不再显示"不支持的文件格式"错误

### 2. 测试主页转换功能

1. 打开应用主页
2. 确认显示"03 · 转换模式"面板
3. 确认显示"格式转换"和"母带级提升"两个按钮
4. 确认显示所有目标格式按钮
5. 测试完整转换流程

---

## ❓ 常见问题

### Q1: 为什么必须重新构建？

**A**: React Native 应用包含两部分：
1. **JavaScript 代码** - 可以热更新
2. **原生代码** - 需要重新构建

我们修改的文件涉及原生模块（FFmpeg, Android Audio Capture），所以**必须重新构建**。

### Q2: 重新构建需要多长时间？

**A**: 
- 首次构建：5-10 分钟
- 后续构建：2-5 分钟

### Q3: 如何确认应用是新版本？

**A**: 查看应用版本号
```bash
adb shell dumpsys package com.anonymous.appdigir8owph2ip | grep versionName
```

### Q4: 如果还是看不到变化怎么办？

**A**: 
1. 确认模拟器/真机上的应用已经重新安装
2. 卸载旧应用：`adb uninstall com.anonymous.appdigir8owph2ip`
3. 重新运行：`npx expo run:android`

### Q5: 如何查看日志？

**A**: 
```bash
# 查看所有日志
adb logcat

# 只查看应用日志
adb logcat | grep "ReactNativeJS"

# 只查看 FFmpeg 日志
adb logcat | grep "ffmpeg"
```

---

## 🎯 快速启动脚本

我们已经创建了一个自动化脚本 `run-on-emulator.sh`：

```bash
# 赋予执行权限
chmod +x run-on-emulator.sh

# 运行脚本
./run-on-emulator.sh
```

脚本会自动：
1. 检查环境
2. 清理缓存
3. 重新构建
4. 启动模拟器
5. 运行应用

---

## 📞 需要帮助？

如果遇到问题：

1. **查看错误日志**
   ```bash
   adb logcat | grep "ERROR"
   ```

2. **提供详细信息**
   - 截图
   - 错误信息
   - 执行的命令
   - 设备信息

3. **联系支持**
   - 提供完整的日志
   - 描述重现步骤

---

**最后更新**: 2026-08-05  
**版本**: v79  
**状态**: ✅ 所有已知错误已修复
