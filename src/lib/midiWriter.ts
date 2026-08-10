/**
 * midiWriter — 将简谱音符序列导出为标准 MIDI（.mid）文件
 *
 * 说明：移动端为「草稿生成」，基于已识别的单音序列（简谱 1-7 + 八度标记），
 * 转换为 C 大调 MIDI 音符，需后期在宿主软件中精修。
 *
 * 简谱 → MIDI（C 大调，中央 C=60）：
 *   1=C(60) 2=D(62) 3=E(64) 4=F(65) 5=G(67) 6=A(69) 7=B(71)
 *   ' 上八度 (+12)   , 下八度 (-12)   . 附点(延长)   — 延音(保持上一音)
 *   0 休止符
 */

const NOTE_BASE: Record<string, number> = {
  "1": 60, "2": 62, "3": 64, "4": 65, "5": 67, "6": 69, "7": 71,
};

/** 写入 4 字节大端无符号整数 */
function writeUint32BE(buf: number[], offset: number, value: number) {
  buf[offset]     = (value >>> 24) & 0xff;
  buf[offset + 1] = (value >>> 16) & 0xff;
  buf[offset + 2] = (value >>> 8) & 0xff;
  buf[offset + 3] = value & 0xff;
}

/** MIDI 变长量编码（delta time） */
function encodeVarLen(value: number): number[] {
  const bytes: number[] = [];
  let v = value & 0x7f;
  bytes.unshift(v);
  value >>>= 7;
  while (value > 0) {
    v = value & 0x7f;
    bytes.unshift(v | 0x80);
    value >>>= 7;
  }
  return bytes;
}

/** 将简谱音符序列构建为 MIDI 文件字节数组 */
export function buildMidiFile(notes: string[], bpm = 120): Uint8Array {
  const ppq = 480; // ticks per quarter
  const quarterTicks = ppq;
  const eighthTicks = Math.round(ppq / 2);

  const events: number[] = [];
  // tempo meta：微秒/四分音符
  const microsPerQuarter = Math.round(60000000 / bpm);
  events.push(0, 0xff, 0x51, 0x03,
    (microsPerQuarter >>> 16) & 0xff,
    (microsPerQuarter >>> 8) & 0xff,
    microsPerQuarter & 0xff);

  let _lastNote = 60;
  void _lastNote; // 保留以供未来扩展和弦逻辑
  let time = 0;
  for (const raw of notes) {
    const note = raw.trim();
    if (note === "0") {
      // 休止：仅推进时间
      time += quarterTicks;
      continue;
    }
    if (note === "—") {
      // 延音：保持上一音，延长一个八分音符
      time += eighthTicks;
      continue;
    }

    const base = note.replace(/[',.]/g, "");
    const midi = NOTE_BASE[base];
    if (midi === undefined) {
      time += quarterTicks;
      continue;
    }
    let pitch = midi;
    if (note.includes("'")) pitch += 12;
    if (note.includes(",")) pitch -= 12;

    const dur = note.includes(".") ? quarterTicks + eighthTicks : quarterTicks;
    // note on
    events.push(...encodeVarLen(time), 0x90, pitch & 0x7f, 100);
    // note off
    events.push(...encodeVarLen(dur), 0x80, pitch & 0x7f, 0);
    time = 0; // 后续 delta 相对上一事件
  }

  // end of track
  events.push(0, 0xff, 0x2f, 0x00);

  const trackLen = events.length;
  const header = [
    0x4d, 0x54, 0x68, 0x64, // "MThd"
    0x00, 0x00, 0x00, 0x06, // header length
    0x00, 0x00,              // format 0
    0x00, 0x01,              // 1 track
    (ppq >>> 8) & 0xff, ppq & 0xff,
  ];
  const out = header.concat([
    0x4d, 0x54, 0x72, 0x6b, // "MTrk"
    0, 0, 0, 0,              // track length placeholder
    ...events,
  ]);
  writeUint32BE(out, header.length + 4, trackLen);
  return Uint8Array.from(out);
}