/// <reference types="nativewind/types" />

// 允许 CSS 文件作为副作用导入（NativeWind global.css）
declare module "*.css" {
  const content: never;
  export default content;
}
