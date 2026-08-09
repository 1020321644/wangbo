# 📋 如何下载 AudioSR.onnx 模型文件

## 🎯 目标

下载 AudioSR 音频超分辨率模型文件，放到 `assets/` 目录

---

## 📝 推荐模型

### 方法 1: Hugging Face - haoheliu/AudioSR（推荐）

**模型地址**: https://huggingface.co/haoheliu/AudioSR

**下载步骤**:
1. 访问 https://huggingface.co/haoheliu/AudioSR
2. 点击 "Files and versions" 标签
3. 查找 `.onnx` 文件（如果有）
4. 如果没有 `.onnx` 文件，下载 PyTorch 模型并转换（见下文）

---

### 方法 2: 使用预训练的音频超分辨率模型

**搜索关键词**:
- "audio super resolution onnx"
- "audio upsampling onnx"
- "audio enhancement onnx"

**推荐平台**:
- Hugging Face: https://huggingface.co/models
- ONNX Model Zoo: https://github.com/onnx/models
- GitHub: 搜索 "audio super resolution onnx"

---

### 方法 3: 转换 PyTorch 模型为 ONNX

如果找不到现成的 ONNX 模型，可以自己转换：

**步骤 1: 安装依赖**
```bash
pip install torch onnx onnxruntime
```

**步骤 2: 下载 PyTorch 模型**
```python
from transformers import AutoModel

model = AutoModel.from_pretrained("haoheliu/AudioSR")
```

**步骤 3: 转换为 ONNX**
```python
import torch

# 创建示例输入
dummy_input = torch.randn(1, 1, 48000)  # (batch, channels, samples)

# 导出为 ONNX
torch.onnx.export(
    model,
    dummy_input,
    "audiosr.onnx",
    input_names=["input"],
    output_names=["output"],
    dynamic_axes={
        "input": {0: "batch", 2: "samples"},
        "output": {0: "batch", 2: "samples"}
    }
)
```

---

## 📦 模型文件要求

### 文件名
- **必须**: `audiosr.onnx`（小写，符合 Android 资源命名规范）
- **禁止**: `AudioSR.onnx`, `audio_sr.onnx`, `audio-sr.onnx`

### 文件位置
- **必须**: `/workspace/app-dk2quyiid79d/assets/audiosr.onnx`
- **禁止**: 其他任何位置

### 文件大小
- **推荐**: < 100 MB
- **最大**: < 500 MB（否则 APK 体积过大）

---

## 🔧 模型格式要求

### 输入格式
- **张量名称**: `input`（或其他名称，需要在 Kotlin 中调整）
- **张量形状**: `[batch, channels, samples]`
  - `batch`: 批次大小（通常为 1）
  - `channels`: 声道数（通常为 1，单声道）
  - `samples`: 采样点数（动态）
- **数据类型**: `float32`

### 输出格式
- **张量名称**: `output`（或其他名称，需要在 Kotlin 中调整）
- **张量形状**: `[batch, channels, samples]`
  - `samples`: 输出采样点数（通常是输入的 2-4 倍）
- **数据类型**: `float32`

---

## ⚠️ 注意事项

### 1. 模型兼容性

**问题**: 不同的 ONNX 模型可能有不同的输入/输出格式

**解决方案**:
- 使用 Netron 查看模型结构: https://netron.app/
- 检查输入/输出节点名称
- 根据模型调整 Kotlin 代码

**查看模型信息**:
```python
import onnx

model = onnx.load("audiosr.onnx")
print("输入节点:", [input.name for input in model.graph.input])
print("输出节点:", [output.name for output in model.graph.output])
```

---

### 2. 模型大小

**问题**: 模型文件可能很大（几十 MB 到几百 MB）

**影响**:
- APK 体积增加
- 首次启动时间增加
- 内存占用增加

**解决方案**:
- 使用量化模型（INT8/FP16）
- 使用剪枝模型
- 使用蒸馏模型

**量化模型**:
```python
import onnxruntime as ort
from onnxruntime.quantization import quantize_dynamic, QuantType

quantize_dynamic(
    "audiosr.onnx",
    "audiosr_quantized.onnx",
    weight_type=QuantType.QUInt8
)
```

---

### 3. 推理性能

**问题**: AI 推理可能很慢（几秒到几十秒）

**影响**:
- 用户等待时间长
- 电池消耗增加
- 设备发热

**解决方案**:
- 使用 GPU 加速（NNAPI）✅ 已实现
- 优化模型（剪枝、量化）
- 使用轻量级模型

---

## 📊 备选方案

### 如果找不到 AudioSR 模型

可以使用其他音频处理模型：

1. **音频去噪模型**
   - `facebook/denoiser`
   - `microsoft/dns-challenge`

2. **音频增强模型**
   - `microsoft/audio-enhancement`
   - `google/audio-enhancement`

3. **音频上采样模型**
   - `audio-upsampling`
   - `audio-resampling`

---

## 🧪 测试模型

### 步骤 1: 下载模型文件

```bash
# 假设您已经下载了模型文件
cp ~/Downloads/audiosr.onnx /workspace/app-dk2quyiid79d/assets/
```

### 步骤 2: 验证模型文件

```bash
cd /workspace/app-dk2quyiid79d
ls -lh assets/audiosr.onnx
```

**预期输出**:
```
-rw-r--r-- 1 user user 50M Jan 1 12:00 assets/audiosr.onnx
```

### 步骤 3: 重新构建应用

```bash
cd /workspace/app-dk2quyiid79d
rm -rf android ios node_modules/.cache .expo
npx expo prebuild --clean
npx expo run:android
```

### 步骤 4: 查看日志

```bash
adb logcat | grep -E "AudioSR|App"
```

**预期日志（成功）**:
```
[App] AudioSR 模型加载成功
[AudioSR] 开始加载模型: audiosr.onnx
[AudioSR] 模型文件大小: 50 MB
[AudioSR] ONNX Runtime 环境创建成功
[AudioSR] NNAPI (GPU) 加速已启用
[AudioSR] 模型加载成功
```

---

## 🎯 总结

### 推荐方案

1. ✅ **方法 1**: 从 Hugging Face 下载 haoheliu/AudioSR
2. ✅ **方法 2**: 搜索其他音频超分辨率 ONNX 模型
3. ✅ **方法 3**: 转换 PyTorch 模型为 ONNX

### 文件要求

- **文件名**: `audiosr.onnx`（小写）
- **位置**: `/workspace/app-dk2quyiid79d/assets/`
- **大小**: < 100 MB（推荐）

### 下一步

1. 下载模型文件
2. 放到 `assets/` 目录
3. 重新构建应用
4. 测试 AI 处理

---

**最后更新**: 2026-08-05  
**版本**: v79  
**状态**: 等待模型文件下载
