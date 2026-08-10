import { Redirect } from "expo-router";

// 启动入口：直接跳转到 Tab 主页
export default function Index() {
  return <Redirect href="/(tabs)/home" />;
}
