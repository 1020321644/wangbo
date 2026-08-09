/**
 * 法律法规
 */

import { View, Text, ScrollView, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft } from "lucide-react-native";
import { useColors } from "@/lib/theme";

export default function LegalTermsScreen() {
  const router = useRouter();
  const C = useColors();
  const insets = useSafeAreaInsets();

  return (
    <View className="flex-1" style={{ paddingTop: insets.top, backgroundColor: C.background }}>
      {/* 标题栏 */}
      <View style={{ flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: C.border, backgroundColor: C.panel, paddingHorizontal: 16, paddingVertical: 12 }}>
        <Pressable onPress={() => router.back()} style={{ marginRight: 12 }}>
          <ArrowLeft size={20} color={C.orange} />
        </Pressable>
        <View>
          <Text style={{ fontFamily: "monospace", fontSize: 20, fontWeight: "bold", color: C.orange }}>法律法规</Text>
          <Text style={{ fontFamily: "monospace", fontSize: 10, color: C.muted }}>LEGAL TERMS</Text>
        </View>
      </View>

      <ScrollView 
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, gap: 16 }}
        contentInsetAdjustmentBehavior="automatic"
      >
        <View style={{ borderWidth: 1, borderColor: C.border, backgroundColor: C.panel }}>
          <View style={{ borderBottomWidth: 1, borderBottomColor: C.border, paddingHorizontal: 16, paddingVertical: 8 }}>
            <Text style={{ fontFamily: "monospace", fontSize: 10, fontWeight: "bold", color: C.muted }}>适用法律法规</Text>
          </View>
          
          <View style={{ padding: 16, gap: 16 }}>
            <View>
              <Text style={{ fontFamily: "monospace", fontSize: 12, fontWeight: "bold", color: C.orange, marginBottom: 8 }}>一、适用法律</Text>
              <Text style={{ fontFamily: "monospace", fontSize: 10, color: C.text, lineHeight: 16 }}>
                本应用的开发、运营和使用遵守以下中华人民共和国法律法规：
                {"\n\n"}• 《中华人民共和国网络安全法》
                {"\n"}• 《中华人民共和国数据安全法》
                {"\n"}• 《中华人民共和国个人信息保护法》
                {"\n"}• 《中华人民共和国著作权法》
                {"\n"}• 《中华人民共和国电信条例》
                {"\n"}• 《互联网信息服务管理办法》
                {"\n"}• 《移动互联网应用程序信息服务管理规定》
              </Text>
            </View>

            <View>
              <Text style={{ fontFamily: "monospace", fontSize: 12, fontWeight: "bold", color: C.orange, marginBottom: 8 }}>二、个人信息保护</Text>
              <Text style={{ fontFamily: "monospace", fontSize: 10, color: C.text, lineHeight: 16 }}>
                根据《中华人民共和国个人信息保护法》，我们承诺：
                {"\n\n"}1. 遵循合法、正当、必要和诚信原则处理个人信息
                {"\n"}2. 公开个人信息处理规则，明示处理的目的、方式和范围
                {"\n"}3. 不得过度收集个人信息
                {"\n"}4. 采取必要措施保障个人信息安全
                {"\n"}5. 不得非法出售、提供或者公开个人信息
                {"\n"}6. 尊重用户的个人信息权利（知情权、决定权、查询权、更正权、删除权等）
              </Text>
            </View>

            <View>
              <Text style={{ fontFamily: "monospace", fontSize: 12, fontWeight: "bold", color: C.orange, marginBottom: 8 }}>三、数据安全</Text>
              <Text style={{ fontFamily: "monospace", fontSize: 10, color: C.text, lineHeight: 16 }}>
                根据《中华人民共和国数据安全法》，我们承诺：
                {"\n\n"}1. 建立健全全流程数据安全管理制度
                {"\n"}2. 组织开展数据安全教育培训
                {"\n"}3. 采取相应的技术措施和其他必要措施保障数据安全
                {"\n"}4. 发生数据安全事件时，立即采取补救措施并按规定告知用户
              </Text>
            </View>

            <View>
              <Text style={{ fontFamily: "monospace", fontSize: 12, fontWeight: "bold", color: C.orange, marginBottom: 8 }}>四、知识产权保护</Text>
              <Text style={{ fontFamily: "monospace", fontSize: 10, color: C.text, lineHeight: 16 }}>
                根据《中华人民共和国著作权法》，我们提醒您：
                {"\n\n"}1. 尊重他人的著作权，不得侵犯他人的知识产权
                {"\n"}2. 不得使用本应用处理盗版音频文件
                {"\n"}3. 不得将本应用用于侵犯他人著作权的行为
                {"\n"}4. 如发现侵权行为，请及时联系我们
              </Text>
            </View>

            <View>
              <Text style={{ fontFamily: "monospace", fontSize: 12, fontWeight: "bold", color: C.orange, marginBottom: 8 }}>五、网络安全</Text>
              <Text style={{ fontFamily: "monospace", fontSize: 10, color: C.text, lineHeight: 16 }}>
                根据《中华人民共和国网络安全法》，我们承诺：
                {"\n\n"}1. 采取技术措施和其他必要措施，保障网络安全、稳定运行
                {"\n"}2. 有效应对网络安全事件，防范网络违法犯罪活动
                {"\n"}3. 维护网络数据的完整性、保密性和可用性
                {"\n"}4. 配合有关部门依法进行的监督检查
              </Text>
            </View>

            <View>
              <Text style={{ fontFamily: "monospace", fontSize: 12, fontWeight: "bold", color: C.orange, marginBottom: 8 }}>六、未成年人保护</Text>
              <Text style={{ fontFamily: "monospace", fontSize: 10, color: C.text, lineHeight: 16 }}>
                根据《中华人民共和国未成年人保护法》，我们承诺：
                {"\n\n"}1. 严格保护未成年人的个人信息
                {"\n"}2. 不得向未成年人提供不适宜的内容
                {"\n"}3. 建立未成年人保护机制
                {"\n"}4. 接受监护人的监督和管理
              </Text>
            </View>

            <View>
              <Text style={{ fontFamily: "monospace", fontSize: 12, fontWeight: "bold", color: C.orange, marginBottom: 8 }}>七、禁止行为</Text>
              <Text style={{ fontFamily: "monospace", fontSize: 10, color: C.text, lineHeight: 16 }}>
                根据相关法律法规，严禁使用本应用从事以下行为：
                {"\n\n"}1. 制作、复制、发布、传播违法信息
                {"\n"}2. 侵犯他人知识产权、隐私权等合法权益
                {"\n"}3. 危害网络安全、破坏网络秩序
                {"\n"}4. 利用网络从事危害国家安全、荣誉和利益的活动
                {"\n"}5. 煽动颠覆国家政权、推翻社会主义制度
                {"\n"}6. 煽动分裂国家、破坏国家统一
                {"\n"}7. 宣扬恐怖主义、极端主义
                {"\n"}8. 宣扬民族仇恨、民族歧视
                {"\n"}9. 传播暴力、淫秽色情信息
                {"\n"}10. 编造、传播虚假信息扰乱经济秩序和社会秩序
              </Text>
            </View>

            <View>
              <Text style={{ fontFamily: "monospace", fontSize: 12, fontWeight: "bold", color: C.orange, marginBottom: 8 }}>八、法律责任</Text>
              <Text style={{ fontFamily: "monospace", fontSize: 10, color: C.text, lineHeight: 16 }}>
                1. 用户违反相关法律法规的，应依法承担法律责任
                {"\n"}2. 因用户违法行为给他人造成损害的，用户应依法承担民事责任
                {"\n"}3. 因用户违法行为给本应用造成损失的，用户应依法承担赔偿责任
                {"\n"}4. 我们将配合有关部门依法查处违法行为
              </Text>
            </View>

            <View>
              <Text style={{ fontFamily: "monospace", fontSize: 12, fontWeight: "bold", color: C.orange, marginBottom: 8 }}>九、争议解决</Text>
              <Text style={{ fontFamily: "monospace", fontSize: 10, color: C.text, lineHeight: 16 }}>
                1. 本条款的解释、效力及纠纷的解决，适用中华人民共和国法律
                {"\n"}2. 若用户和本应用之间发生任何纠纷或争议，首先应友好协商解决
                {"\n"}3. 协商不成的，任何一方均可向开发者所在地人民法院提起诉讼
              </Text>
            </View>

            <View>
              <Text style={{ fontFamily: "monospace", fontSize: 12, fontWeight: "bold", color: C.orange, marginBottom: 8 }}>十、联系我们</Text>
              <Text style={{ fontFamily: "monospace", fontSize: 10, color: C.text, lineHeight: 16 }}>
                如果您对本条款有任何疑问，或需要举报违法违规行为，请通过以下方式联系我们：
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
