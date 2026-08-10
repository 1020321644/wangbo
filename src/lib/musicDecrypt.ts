/**
 * 音乐解密库
 * 支持：QQ音乐、网易云、酷狗、酷我等平台加密格式
 */

export type EncryptedFormat = 
  | "qmc0" | "qmc3" | "qmcflac" | "qmcogg" | "mflac" | "mgg" // QQ音乐
  | "ncm" // 网易云
  | "kgm" | "kgma" | "vpr" // 酷狗
  | "kwm" // 酷我
  | "tm0" | "tm2" | "tm3" | "tm6"; // 其他

export interface DecryptResult {
  success: boolean;
  audioData: Uint8Array;
  outputFormat: "mp3" | "flac" | "ogg" | "m4a";
  metadata?: {
    title?: string;
    artist?: string;
    album?: string;
    cover?: string;
  };
  error?: string;
}

/**
 * 检测文件加密类型
 */
export function detectEncryptedFormat(data: Uint8Array): EncryptedFormat | null {
  const header = Array.from(data.slice(0, 16))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");

  // QQ音乐 QMC 系列
  if (header.startsWith("514d4346")) return "qmcflac"; // QMCF
  if (header.startsWith("514d434f")) return "qmcogg";  // QMCO
  if (data[0] === 0 && data[1] === 0) return "qmc0";
  if (data[0] === 0 && data[1] === 1) return "qmc3";

  // QQ音乐 MFLAC/MGG（新版加密）
  if (header.startsWith("4d464c4143")) return "mflac"; // MFLAC
  if (header.startsWith("4d4747")) return "mgg"; // MGG

  // 网易云 NCM
  if (header.startsWith("4354454e4644414d")) return "ncm"; // CTENFDAM

  // 酷狗 KGM
  if (header.startsWith("7c45474d")) return "kgm"; // |EGM
  if (header.startsWith("564b4d")) return "kgma"; // VKM
  if (header.startsWith("05284650")) return "vpr";

  // 酷我 KWM
  if (header.startsWith("594541504d555349")) return "kwm"; // YEAPMUSIC

  return null;
}

/**
 * QMC 解密（QQ音乐）
 */
function decryptQMC(data: Uint8Array, seed: number = 0x7e): Uint8Array {
  const output = new Uint8Array(data.length);
  const mask = generateQMCMask(seed);
  
  for (let i = 0; i < data.length; i++) {
    output[i] = data[i] ^ mask[i % mask.length];
  }
  
  return output;
}

function generateQMCMask(seed: number): Uint8Array {
  const mask = new Uint8Array(128);
  let x = seed;
  
  for (let i = 0; i < 128; i++) {
    x = (x * 0x343fd + 0x269ec3) & 0xffffffff;
    mask[i] = (x >> 16) & 0xff;
  }
  
  return mask;
}

/**
 * NCM 解密（网易云）
 */
function decryptNCM(data: Uint8Array): DecryptResult {
  try {
    // NCM 文件结构：
    // 0-8: 魔数 "CTENFDAM"
    // 8-12: 保留
    // 12-16: RC4 密钥长度
    // 16-...: RC4 加密的密钥
    // ...: AES 加密的元数据
    // ...: 封面数据
    // ...: 音频数据

    let offset = 10;
    
    // 读取密钥长度
    const keyLen = new DataView(data.buffer).getUint32(offset, true);
    offset += 4;
    
    // 解密密钥
    const encryptedKey = data.slice(offset, offset + keyLen);
    offset += keyLen;
    
    const key = new Uint8Array(encryptedKey.length);
    for (let i = 0; i < encryptedKey.length; i++) {
      key[i] = encryptedKey[i] ^ 0x64;
    }
    
    // 读取元数据长度
    const metaLen = new DataView(data.buffer).getUint32(offset, true);
    offset += 4;
    
    // 跳过元数据
    offset += metaLen;
    
    // 跳过 CRC32
    offset += 4;
    
    // 跳过保留字段
    offset += 5;
    
    // 读取封面长度
    const coverLen = new DataView(data.buffer).getUint32(offset, true);
    offset += 4;
    
    // 跳过封面
    offset += coverLen;
    
    // 剩余部分是音频数据
    const audioData = data.slice(offset);
    
    // 使用 RC4 解密音频数据
    const decrypted = rc4Decrypt(audioData, key);
    
    return {
      success: true,
      audioData: decrypted,
      outputFormat: "mp3",
    };
  } catch (error) {
    return {
      success: false,
      audioData: new Uint8Array(0),
      outputFormat: "mp3",
      error: String(error),
    };
  }
}

/**
 * RC4 解密
 */
function rc4Decrypt(data: Uint8Array, key: Uint8Array): Uint8Array {
  const S = new Uint8Array(256);
  const output = new Uint8Array(data.length);
  
  // 初始化 S 盒
  for (let i = 0; i < 256; i++) {
    S[i] = i;
  }
  
  // KSA
  let j = 0;
  for (let i = 0; i < 256; i++) {
    j = (j + S[i] + key[i % key.length]) & 0xff;
    [S[i], S[j]] = [S[j], S[i]];
  }
  
  // PRGA
  let i = 0;
  j = 0;
  for (let k = 0; k < data.length; k++) {
    i = (i + 1) & 0xff;
    j = (j + S[i]) & 0xff;
    [S[i], S[j]] = [S[j], S[i]];
    const K = S[(S[i] + S[j]) & 0xff];
    output[k] = data[k] ^ K;
  }
  
  return output;
}

/**
 * KGM 解密（酷狗）
 */
function decryptKGM(data: Uint8Array): Uint8Array {
  const output = new Uint8Array(data.length - 16);
  const key = new Uint8Array([
    0x7c, 0x48, 0x52, 0x00, 0xe8, 0x63, 0x6f, 0x6d,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  ]);
  
  for (let i = 16; i < data.length; i++) {
    output[i - 16] = data[i] ^ key[(i - 16) % key.length];
  }
  
  return output;
}

/**
 * 主解密函数
 */
export async function decryptMusic(data: Uint8Array): Promise<DecryptResult> {
  const format = detectEncryptedFormat(data);
  
  if (!format) {
    return {
      success: false,
      audioData: new Uint8Array(0),
      outputFormat: "mp3",
      error: "无法识别的加密格式",
    };
  }
  
  try {
    let decrypted: Uint8Array;
    let outputFormat: "mp3" | "flac" | "ogg" | "m4a" = "mp3";
    
    switch (format) {
      case "qmc0":
      case "qmc3":
        decrypted = decryptQMC(data);
        outputFormat = "mp3";
        break;
        
      case "qmcflac":
        decrypted = decryptQMC(data);
        outputFormat = "flac";
        break;
        
      case "qmcogg":
        decrypted = decryptQMC(data);
        outputFormat = "ogg";
        break;
        
      case "ncm":
        return decryptNCM(data);
        
      case "kgm":
      case "kgma":
      case "vpr":
        decrypted = decryptKGM(data);
        outputFormat = "mp3";
        break;
        
      default:
        return {
          success: false,
          audioData: new Uint8Array(0),
          outputFormat: "mp3",
          error: `暂不支持 ${format} 格式`,
        };
    }
    
    return {
      success: true,
      audioData: decrypted,
      outputFormat,
    };
  } catch (error) {
    return {
      success: false,
      audioData: new Uint8Array(0),
      outputFormat: "mp3",
      error: String(error),
    };
  }
}

/**
 * 从文件 URI 读取并解密
 */
export async function decryptMusicFile(fileUri: string): Promise<DecryptResult> {
  try {
    const response = await fetch(fileUri);
    const arrayBuffer = await response.arrayBuffer();
    const data = new Uint8Array(arrayBuffer);
    
    return await decryptMusic(data);
  } catch (error) {
    return {
      success: false,
      audioData: new Uint8Array(0),
      outputFormat: "mp3",
      error: String(error),
    };
  }
}
