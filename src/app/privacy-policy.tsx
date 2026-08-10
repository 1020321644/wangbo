/**
 * 隐私政策
 */

import { View, Text, ScrollView, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft } from "lucide-react-native";
import { useColors } from "@/lib/theme";

export default function PrivacyPolicyScreen() {
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
          <Text style={{ fontFamily: "monospace", fontSize: 20, fontWeight: "bold", color: C.orange }}>隐私政策</Text>
          <Text style={{ fontFamily: "monospace", fontSize: 10, color: C.muted }}>PRIVACY POLICY</Text>
        </View>
      </View>

      <ScrollView 
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, gap: 16 }}
        contentInsetAdjustmentBehavior="automatic"
      >
        <View style={{ borderWidth: 1, borderColor: C.border, backgroundColor: C.panel }}>
          <View style={{ borderBottomWidth: 1, borderBottomColor: C.border, paddingHorizontal: 16, paddingVertical: 8 }}>
            <Text style={{ fontFamily: "monospace", fontSize: 10, fontWeight: "bold", color: C.muted }}>更新日期：2026年8月5日</Text>
          </View>
          
          <View style={{ padding: 16, gap: 16 }}>
            <View>
              <Text style={{ fontFamily: "monospace", fontSize: 12, fontWeight: "bold", color: C.orange, marginBottom: 8 }}>一、引言</Text>
              <Text style={{ fontFamily: "monospace", fontSize: 10, color: C.text, lineHeight: 16 }}>
                欢迎使用音乐格式转换器 App（以下简称"本应用"）。我们非常重视您的隐私保护和个人信息安全。
                本隐私政策旨在向您说明我们如何收集、使用、存储、共享和保护您的个人信息，以及您享有的相关权利。
              </Text>
            </View>

            <View>
              <Text style={{ fontFamily: "monospace", fontSize: 12, fontWeight: "bold", color: C.orange, marginBottom: 8 }}>二、我们收集的信息</Text>
              <Text style={{ fontFamily: "monospace", fontSize: 10, color: C.text, lineHeight: 16 }}>
                本应用仅在本地设备上运行，不会主动收集、上传或存储您的个人信息到远程服务器。
                {"\n\n"}我们可能在本地存储以下信息：
                {"\n"}• 音频文件：您上传或录制的音频文件仅存储在您的设备本地
                {"\n"}• 转换历史：格式转换记录仅存储在您的设备本地
                {"\n"}• 应用设置：您的个性化设置（如参数配置）仅存储在您的设备本地
                {"\n"}• 日志记录：应用运行日志仅存储在您的设备本地，用于问题排查
              </Text>
            </View>

            <View>
              <Text style={{ fontFamily: "monospace", fontSize: 12, fontWeight: "bold", color: C.orange, marginBottom: 8 }}>三、权限说明</Text>
              <Text style={{ fontFamily: "monospace", fontSize: 10, color: C.text, lineHeight: 16 }}>
                本应用可能需要以下权限：
                {"\n\n"}• 麦克风权限：用于录制音频功能
                {"\n"}• 存储权限：用于读取和保存音频文件
                {"\n"}• 网络权限：仅用于 Web 端系统内录功能（桌面浏览器）
                {"\n\n"}所有权限均在您明确授权后才会使用，您可以随时在系统设置中撤销权限。
              </Text>
            </View>

            <View>
              <Text style={{ fontFamily: "monospace", fontSize: 12, fontWeight: "bold", color: C.orange, marginBottom: 8 }}>四、信息的使用</Text>
              <Text style={{ fontFamily: "monospace", fontSize: 10, color: C.text, lineHeight: 16 }}>
                我们收集的信息仅用于：
                {"\n"}• 提供音频格式转换服务
                {"\n"}• 提供音频录制和播放功能
                {"\n"}• 改进应用功能和用户体验
                {"\n"}• 排查和修复应用问题
                {"\n\n"}我们不会将您的信息用于任何其他目的。
              </Text>
            </View>

            <View>
              <Text style={{ fontFamily: "monospace", fontSize: 12, fontWeight: "bold", color: C.orange, marginBottom: 8 }}>五、信息的共享</Text>
              <Text style={{ fontFamily: "monospace", fontSize: 10, color: C.text, lineHeight: 16 }}>
                我们承诺：
                {"\n"}• 不会向任何第三方出售、出租或共享您的个人信息
                {"\n"}• 不会将您的音频文件上传到任何服务器
                {"\n"}• 所有数据处理均在您的设备本地完成
              </Text>
            </View>

            <View>
              <Text style={{ fontFamily: "monospace", fontSize: 12, fontWeight: "bold", color: C.orange, marginBottom: 8 }}>六、信息的安全</Text>
              <Text style={{ fontFamily: "monospace", fontSize: 10, color: C.text, lineHeight: 16 }}>
                我们采取以下措施保护您的信息安全：
                {"\n"}• 所有数据仅存储在您的设备本地
                {"\n"}• 使用加密技术保护敏感数据
                {"\n"}• 定期更新应用以修复安全漏洞
              </Text>
            </View>

            <View>
              <Text style={{ fontFamily: "monospace", fontSize: 12, fontWeight: "bold", color: C.orange, marginBottom: 8 }}>七、您的权利</Text>
              <Text style={{ fontFamily: "monospace", fontSize: 10, color: C.text, lineHeight: 16 }}>
                您享有以下权利：
                {"\n"}• 访问权：您可以随时查看本地存储的所有数据
                {"\n"}• 删除权：您可以随时删除本地存储的任何数据
                {"\n"}• 撤销权：您可以随时撤销应用权限
                {"\n"}• 导出权：您可以导出日志报告用于问题排查
              </Text>
            </View>

            <View>
              <Text style={{ fontFamily: "monospace", fontSize: 12, fontWeight: "bold", color: C.orange, marginBottom: 8 }}>八、未成年人保护</Text>
              <Text style={{ fontFamily: "monospace", fontSize: 10, color: C.text, lineHeight: 16 }}>
                我们非常重视未成年人的个人信息保护。如果您是未成年人，请在监护人的陪同下使用本应用。
              </Text>
            </View>

            <View>
              <Text style={{ fontFamily: "monospace", fontSize: 12, fontWeight: "bold", color: C.orange, marginBottom: 8 }}>九、隐私政策的更新</Text>
              <Text style={{ fontFamily: "monospace", fontSize: 10, color: C.text, lineHeight: 16 }}>
                我们可能会不时更新本隐私政策。更新后的隐私政策将在应用内发布，并在您继续使用本应用时生效。
              </Text>
            </View>

            <View>
              <Text style={{ fontFamily: "monospace", fontSize: 12, fontWeight: "bold", color: C.orange, marginBottom: 8 }}>十、联系我们</Text>
              <Text style={{ fontFamily: "monospace", fontSize: 10, color: C.text, lineHeight: 16 }}>
                如果您对本隐私政策有任何疑问或建议，请通过以下方式联系我们：
                {"\n\n"}开发者：{DEVELOPER}
                {"\n"}微信号：{WECHAT}
                {"\n"}邮箱：{EMAIL}
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const DEVELOPER = "小布丁";
const WECHAT = "ppppp2527";
const EMAIL = "1020321644@qq.com";
