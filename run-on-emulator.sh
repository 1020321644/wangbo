#!/bin/bash

# 🚀 Android 模拟器启动和应用运行脚本
# 使用方法: bash tasks/run-on-emulator.sh

set -e  # 遇到错误立即退出

echo "🚀 Android 模拟器启动和应用运行脚本"
echo "========================================"
echo ""

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 步骤 1: 检查 Android SDK
echo -e "${BLUE}[1/7]${NC} 检查 Android SDK..."
if [ -z "$ANDROID_HOME" ]; then
    echo -e "${RED}❌ ANDROID_HOME 环境变量未设置${NC}"
    echo ""
    echo "请设置 ANDROID_HOME 环境变量："
    echo "  export ANDROID_HOME=\$HOME/Library/Android/sdk  # macOS"
    echo "  export ANDROID_HOME=\$HOME/Android/Sdk          # Linux"
    echo "  export ANDROID_HOME=C:\\Users\\YourName\\AppData\\Local\\Android\\Sdk  # Windows"
    echo ""
    echo "然后添加到 PATH："
    echo "  export PATH=\$PATH:\$ANDROID_HOME/emulator"
    echo "  export PATH=\$PATH:\$ANDROID_HOME/platform-tools"
    exit 1
else
    echo -e "${GREEN}✅ ANDROID_HOME: $ANDROID_HOME${NC}"
fi

# 步骤 2: 检查 emulator 命令
echo ""
echo -e "${BLUE}[2/7]${NC} 检查 emulator 命令..."
if ! command -v emulator &> /dev/null; then
    echo -e "${RED}❌ emulator 命令未找到${NC}"
    echo ""
    echo "请将 emulator 添加到 PATH："
    echo "  export PATH=\$PATH:\$ANDROID_HOME/emulator"
    exit 1
else
    echo -e "${GREEN}✅ emulator 命令已找到${NC}"
fi

# 步骤 3: 列出可用的 AVD
echo ""
echo -e "${BLUE}[3/7]${NC} 列出可用的 Android 虚拟设备（AVD）..."
AVD_LIST=$(emulator -list-avds)

if [ -z "$AVD_LIST" ]; then
    echo -e "${RED}❌ 未找到任何 AVD${NC}"
    echo ""
    echo "请在 Android Studio 中创建一个 AVD："
    echo "  1. 打开 Android Studio"
    echo "  2. Tools → Device Manager"
    echo "  3. 点击 'Create Device'"
    echo "  4. 选择设备型号（推荐：Pixel 6）"
    echo "  5. 选择系统镜像（推荐：Android 13, API 33）"
    echo "  6. 点击 'Finish'"
    exit 1
else
    echo -e "${GREEN}✅ 找到以下 AVD:${NC}"
    echo "$AVD_LIST"
    echo ""
    
    # 选择第一个 AVD
    AVD_NAME=$(echo "$AVD_LIST" | head -n 1)
    echo -e "${YELLOW}将使用 AVD: $AVD_NAME${NC}"
fi

# 步骤 4: 检查模拟器是否已经在运行
echo ""
echo -e "${BLUE}[4/7]${NC} 检查模拟器状态..."
RUNNING_DEVICES=$(adb devices | grep -v "List" | grep "device" | wc -l)

if [ "$RUNNING_DEVICES" -gt 0 ]; then
    echo -e "${GREEN}✅ 模拟器已经在运行${NC}"
    adb devices
else
    echo -e "${YELLOW}⚠️  模拟器未运行，正在启动...${NC}"
    echo ""
    echo "启动命令: emulator -avd $AVD_NAME &"
    echo ""
    echo -e "${YELLOW}请手动运行以下命令启动模拟器：${NC}"
    echo ""
    echo "  emulator -avd $AVD_NAME &"
    echo ""
    echo "或者在 Android Studio 中启动："
    echo "  1. 打开 Android Studio"
    echo "  2. Tools → Device Manager"
    echo "  3. 点击设备旁边的播放按钮"
    echo ""
    read -p "模拟器启动后，按 Enter 继续..."
fi

# 步骤 5: 等待模拟器完全启动
echo ""
echo -e "${BLUE}[5/7]${NC} 等待模拟器完全启动..."
echo "这可能需要 30-60 秒..."

# 等待设备上线
adb wait-for-device

# 等待系统启动完成
while [ "$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" != "1" ]; do
    echo -n "."
    sleep 2
done

echo ""
echo -e "${GREEN}✅ 模拟器已完全启动${NC}"

# 步骤 6: 清理并重新构建
echo ""
echo -e "${BLUE}[6/7]${NC} 清理并重新构建应用..."
cd /workspace/app-dk2quyiid79d

echo "清理旧的构建..."
rm -rf android ios

echo "生成原生代码（Config Plugin 会自动注入）..."
npx expo prebuild --clean

echo -e "${GREEN}✅ 构建完成${NC}"

# 步骤 7: 运行应用
echo ""
echo -e "${BLUE}[7/7]${NC} 在模拟器上运行应用..."
echo ""
echo "这可能需要几分钟..."
echo ""

npx expo run:android

echo ""
echo -e "${GREEN}🎉 应用已成功启动！${NC}"
echo ""
echo "现在您可以："
echo "  1. 导航到 /audio-enhance-test 测试音频增强"
echo "  2. 导航到 /android-audio-test 测试系统内录"
echo ""
echo "查看日志："
echo "  adb logcat | grep 'processWithAI\\|processWithFFmpeg\\|AudioCapture'"
