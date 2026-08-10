/**
 * 用户协议
 */

import { View, Text, ScrollView, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft } from "lucide-react-native";
import { useColors } from "@/lib/theme";

export default function UserAgreementScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const C = useColors();

  return (
    <View className="flex-1" style={{ paddingTop: insets.top, backgroundColor: "#0A1128" }}>
      {/* 标题栏 */}
      <View style={{ flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: C.border, backgroundColor: C.panel, paddingHorizontal: 16, paddingVertical: 12 }}>
        <Pressable onPress={() => router.back()} style={{ marginRight: 12 }}>
          <ArrowLeft size={20} color={C.orange} />
        </Pressable>
        <View>
          <Text style={{ fontFamily: "monospace", fontSize: 20, fontWeight: "bold", color: C.orange }}>用户协议</Text>
          <Text style={{ fontFamily: "monospace", fontSize: 10, color: C.muted }}>USER AGREEMENT</Text>
        </View>
      </View>

      <ScrollView 
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, gap: 16 }}
        contentInsetAdjustmentBehavior="automatic"
      >
        <View style={{ borderWidth: 1, borderColor: C.border, backgroundColor: C.panel }}>
          <View style={{ borderBottomWidth: 1, borderBottomColor: C.border, paddingHorizontal: 16, paddingVertical: 8 }}>
            <Text style={{ fontFamily: "monospace", fontSize: 10, fontWeight: "bold", color: C.muted }}>生效日期：2026年8月5日</Text>
          </View>
          
          <View style={{ padding: 16, gap: 16 }}>
            <View>
              <Text style={{ fontFamily: "monospace", fontSize: 12, fontWeight: "bold", color: C.orange, marginBottom: 8 }}>一、协议的接受</Text>
              <Text style={{ fontFamily: "monospace", fontSize: 10, color: C.text, lineHeight: 16 }}>
                欢迎使用音乐格式转换器 App（以下简称"本应用"）。在使用本应用之前，请您仔细阅读并充分理解本协议的全部内容。
                {"\n\n"}您下载、安装、使用本应用即表示您已阅读并同意接受本协议的全部条款。如果您不同意本协议的任何内容，请立即停止使用本应用。
              </Text>
            </View>

            <View>
              <Text style={{ fontFamily: "monospace", fontSize: 12, fontWeight: "bold", color: C.orange, marginBottom: 8 }}>二、服务内容</Text>
              <Text style={{ fontFamily: "monospace", fontSize: 10, color: C.text, lineHeight: 16 }}>
                本应用提供以下服务：
                {"\n"}• 音频格式转换：支持 MP3/FLAC/WAV/AAC/OGG/ALAC/DSD 等多种格式互转
                {"\n"}• 音频录制：支持系统内录（Web 端）和麦克风录制（全平台）
                {"\n"}• 音频播放：支持多种音频格式播放
                {"\n"}• 音频分析：提供音频质量评估、频谱分析等功能
                {"\n"}• 乐谱生成：AI 生成音频乐谱（实验性功能）
                {"\n\n"}所有服务均在您的设备本地运行，不依赖远程服务器。
              </Text>
            </View>

            <View>
              <Text style={{ fontFamily: "monospace", fontSize: 12, fontWeight: "bold", color: C.orange, marginBottom: 8 }}>三、用户义务</Text>
              <Text style={{ fontFamily: "monospace", fontSize: 10, color: C.text, lineHeight: 16 }}>
                您在使用本应用时，应遵守以下义务：
                {"\n\n"}1. 遵守中华人民共和国相关法律法规
                {"\n"}2. 不得使用本应用从事任何违法违规活动
                {"\n"}3. 不得侵犯他人的知识产权、隐私权等合法权益
                {"\n"}4. 不得利用本应用传播违法、有害信息
                {"\n"}5. 不得对本应用进行反向工程、破解或篡改
                {"\n"}6. 不得将本应用用于商业用途（除非获得明确授权）
              </Text>
            </View>

            <View>
              <Text style={{ fontFamily: "monospace", fontSize: 12, fontWeight: "bold", color: C.orange, marginBottom: 8 }}>四、知识产权</Text>
              <Text style={{ fontFamily: "monospace", fontSize: 10, color: C.text, lineHeight: 16 }}>
                1. 本应用的所有知识产权（包括但不限于软件代码、界面设计、文档等）归开发者所有
                {"\n"}2. 您上传或录制的音频文件的知识产权归您所有
                {"\n"}3. 您使用本应用转换的音频文件的知识产权归您所有
                {"\n"}4. 未经开发者书面许可，您不得复制、修改、传播本应用的任何部分
              </Text>
            </View>

            <View>
              <Text style={{ fontFamily: "monospace", fontSize: 12, fontWeight: "bold", color: C.orange, marginBottom: 8 }}>五、免责声明</Text>
              <Text style={{ fontFamily: "monospace", fontSize: 10, color: C.text, lineHeight: 16 }}>
                1. 本应用按"现状"提供，不提供任何明示或暗示的保证
                {"\n"}2. 我们不保证本应用的功能完全满足您的需求
                {"\n"}3. 我们不对因使用本应用导致的任何直接或间接损失承担责任
                {"\n"}4. 我们不对第三方内容（如用户上传的音频文件）承担责任
                {"\n"}5. 我们不对因不可抗力（如自然灾害、战争等）导致的服务中断承担责任
              </Text>
            </View>

            <View>
              <Text style={{ fontFamily: "monospace", fontSize: 12, fontWeight: "bold", color: C.orange, marginBottom: 8 }}>六、隐私保护</Text>
              <Text style={{ fontFamily: "monospace", fontSize: 10, color: C.text, lineHeight: 16 }}>
                我们非常重视您的隐私保护。请参阅《隐私政策》了解我们如何收集、使用、存储和保护您的个人信息。
              </Text>
            </View>

            <View>
              <Text style={{ fontFamily: "monospace", fontSize: 12, fontWeight: "bold", color: C.orange, marginBottom: 8 }}>七、协议的变更</Text>
              <Text style={{ fontFamily: "monospace", fontSize: 10, color: C.text, lineHeight: 16 }}>
                我们有权随时修改本协议的任何条款。修改后的协议将在应用内发布，并在您继续使用本应用时生效。
                {"\n\n"}如果您不同意修改后的协议，请立即停止使用本应用。
              </Text>
            </View>

            <View>
              <Text style={{ fontFamily: "monospace", fontSize: 12, fontWeight: "bold", color: C.orange, marginBottom: 8 }}>八、协议的终止</Text>
              <Text style={{ fontFamily: "monospace", fontSize: 10, color: C.text, lineHeight: 16 }}>
                1. 您可以随时卸载本应用以终止本协议
                {"\n"}2. 如果您违反本协议的任何条款，我们有权终止向您提供服务
                {"\n"}3. 协议终止后，您应立即停止使用本应用并删除所有副本
              </Text>
            </View>

            <View>
              <Text style={{ fontFamily: "monospace", fontSize: 12, fontWeight: "bold", color: C.orange, marginBottom: 8 }}>九、争议解决</Text>
              <Text style={{ fontFamily: "monospace", fontSize: 10, color: C.text, lineHeight: 16 }}>
                1. 本协议的订立、执行和解释均适用中华人民共和国法律
                {"\n"}2. 因本协议引起的任何争议，双方应友好协商解决
                {"\n"}3. 如协商不成，任何一方均可向开发者所在地人民法院提起诉讼
              </Text>
            </View>

            <View>
              <Text style={{ fontFamily: "monospace", fontSize: 12, fontWeight: "bold", color: C.orange, marginBottom: 8 }}>十、联系我们</Text>
              <Text style={{ fontFamily: "monospace", fontSize: 10, color: C.text, lineHeight: 16 }}>
                如果您对本协议有任何疑问或建议，请通过以下方式联系我们：
                {"\n\n"}开发者：小布丁
                {"\n"}微信号：ppppp2527
                {"\n"}邮箱：1020321644@qq.com
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
