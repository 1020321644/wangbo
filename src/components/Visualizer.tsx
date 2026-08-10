import React from "react";
import { View, ScrollView } from "react-native";
import Svg, {
  Circle,
  Ellipse,
  Line as SvgLine,
  Rect as SvgRect,
  Text as SvgText,
} from "react-native-svg";
import { COLORS, useColors } from "@/lib/theme";
import { noteToName, generateChords } from "@/lib/audioEngine";

// 波形图：高精度柱状阵列
export function Waveform({
  data,
  color = COLORS.cyan,
  height = 80,
}: {
  data: number[];
  color?: string;
  height?: number;
}) {
  const C = useColors();
  const W = 320;
  const H = height;
  const gap = 1;
  const barW = Math.max(1, (W - data.length * gap) / data.length);
  return (
    <View style={{ height: H }}>
      <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        <SvgLine x1="0" y1={H / 2} x2={W} y2={H / 2} stroke={C.border} strokeWidth={1} />
        {data.map((v, i) => {
          const h = Math.max(2, v * (H - 4));
          const x = i * (barW + gap);
          const y = (H - h) / 2;
          return <SvgRect key={i} x={x} y={y} width={barW} height={h} fill={color} />;
        })}
      </Svg>
    </View>
  );
}

// 频谱图：热力点阵
export function Spectrum({
  data,
  color = COLORS.cyan,
  height = 80,
}: {
  data: number[];
  color?: string;
  height?: number;
}) {
  const C = useColors();
  const W = 320;
  const H = height;
  const gap = 1;
  const barW = Math.max(1, (W - data.length * gap) / data.length);
  return (
    <View style={{ height: H }}>
      <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        <SvgLine x1="0" y1={H} x2={W} y2={H} stroke={C.border} strokeWidth={1} />
        {data.map((v, i) => {
          const h = Math.max(2, v * (H - 4));
          const x = i * (barW + gap);
          const y = H - h;
          return <SvgRect key={i} x={x} y={y} width={barW} height={h} fill={color} opacity={0.85} />;
        })}
      </Svg>
    </View>
  );
}

// ─── 乐谱渲染组件（多行分小节，A4 友好布局）────────────────────────────────

const NOTES_PER_BAR = 4;
const BARS_PER_ROW  = 8;
const NOTES_PER_ROW = NOTES_PER_BAR * BARS_PER_ROW; // 32

/**
 * 把数组按行切分
 */
function chunkRows<T>(items: T[], rowSize: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += rowSize) {
    rows.push(items.slice(i, i + rowSize));
  }
  return rows;
}

// 简谱：把音符符号渲染为 SVG 元素（含上下点、附点、延音线）
function NumberedNoteEl({
  note, cx, y, fill,
}: { note: string; cx: number; y: number; fill: string }): React.ReactElement {
  const base  = note.replace(/[',.\-—]/g, "");
  const isHigh = note.includes("'");
  const isLow  = note.includes(",");
  const isDot  = note.includes(".") && !isLow;
  const isTie  = note === "—";
  if (isTie) {
    return <SvgText x={cx} y={y} textAnchor="middle" fontFamily="serif" fontSize={16} fill={fill}>—</SvgText>;
  }
  return (
    <>
      <SvgText x={cx} y={y} textAnchor="middle" fontFamily="serif" fontSize={16} fontWeight="bold" fill={fill}>{base}</SvgText>
      {isHigh ? <Circle cx={cx + 6} cy={y - 16} r={2} fill={fill} /> : null}
      {isLow  ? <Circle cx={cx + 6} cy={y + 4}  r={2} fill={fill} /> : null}
      {isDot  ? <Circle cx={cx + 10} cy={y - 5} r={2} fill={fill} /> : null}
    </>
  );
}

// ─── 简谱（多行）─────────────────────────────────────────────────────────────
export function NumberedNotation({
  notes,
  showNoteNames = false,
}: {
  notes: string[];
  showNoteNames?: boolean;
}) {
  const C = useColors();
  const rows   = chunkRows(notes, NOTES_PER_ROW);
  const ROW_H  = 60;
  const PAD    = 8;
  // 每行可用宽度由父容器决定，这里用固定 720 然后 preserveAspectRatio 缩放
  const ROW_W  = 720;
  const CW     = (ROW_W - PAD * 2) / NOTES_PER_ROW;
  const totalH = rows.length * (ROW_H + 16) + 8;

  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      <View style={{ width: "100%" }}>
        <Svg width="100%" height={totalH} viewBox={`0 0 ${ROW_W} ${totalH}`} preserveAspectRatio="xMinYMin meet">
          {rows.map((rowNotes, rowIdx) => {
            const rowY   = rowIdx * (ROW_H + 16);
            const lineY  = rowY + ROW_H - 10;
            const offsetX = rowIdx === 0 ? 18 : 0;
            return (
              <>
                {/* 底线 */}
                <SvgLine key={`bl${rowIdx}`} x1={PAD} y1={lineY} x2={ROW_W - PAD} y2={lineY} stroke={C.border} strokeWidth={1} />
                {/* 拍号（仅第一行） */}
                {rowIdx === 0 ? (
                  <>
                    <SvgText x={PAD} y={rowY + ROW_H / 2 - 2} fontFamily="serif" fontSize={18} fill={C.foreground}>4</SvgText>
                    <SvgLine x1={PAD} y1={rowY + ROW_H / 2 + 2} x2={PAD + 14} y2={rowY + ROW_H / 2 + 2} stroke={C.foreground} strokeWidth={1.5} />
                    <SvgText x={PAD} y={rowY + ROW_H / 2 + 18} fontFamily="serif" fontSize={18} fill={C.foreground}>4</SvgText>
                  </>
                ) : null}
                {rowNotes.map((n, i) => {
                  const cx = PAD + offsetX + i * CW + CW / 2;
                  const nm = showNoteNames ? noteToName(n) : "";
                  return (
                    <>
                      {/* 小节线 */}
                      {i > 0 && i % NOTES_PER_BAR === 0 ? (
                        <SvgLine key={`bar${rowIdx}_${i}`} x1={cx - CW / 2} y1={rowY + 6} x2={cx - CW / 2} y2={lineY} stroke={C.border} strokeWidth={1} />
                      ) : null}
                      <NumberedNoteEl key={`n${rowIdx}_${i}`} note={n} cx={cx} y={rowY + ROW_H / 2 + 4} fill={C.orange} />
                      {nm ? <SvgText key={`nm${rowIdx}_${i}`} x={cx} y={lineY + 12} textAnchor="middle" fontFamily="sans-serif" fontSize={9} fontWeight="bold" fill="#0066cc">{nm}</SvgText> : null}
                    </>
                  );
                })}
                {/* 行末：最后一行双竖线 */}
                {rowIdx === rows.length - 1 ? (
                  <>
                    <SvgLine x1={PAD + offsetX + rowNotes.length * CW}     y1={rowY + 6} x2={PAD + offsetX + rowNotes.length * CW}     y2={lineY} stroke={C.foreground} strokeWidth={2.5} />
                    <SvgLine x1={PAD + offsetX + rowNotes.length * CW + 4} y1={rowY + 6} x2={PAD + offsetX + rowNotes.length * CW + 4} y2={lineY} stroke={C.foreground} strokeWidth={1} />
                  </>
                ) : null}
              </>
            );
          })}
        </Svg>
      </View>
    </ScrollView>
  );
}

// ─── 五线谱（多行）────────────────────────────────────────────────────────────
export function StaffNotation({
  notes,
  showNoteNames = false,
  showChords = false,
  seed = "",
}: {
  notes: string[];
  showNoteNames?: boolean;
  showChords?: boolean;
  seed?: string;
}) {
  const C = useColors();
  const rows   = chunkRows(notes, NOTES_PER_ROW);
  const CHORD_H = showChords ? 58 : 0;
  const NAME_H  = showNoteNames ? 14 : 0;
  const ROW_H  = 80 + CHORD_H + NAME_H;
  const PAD    = 8;
  const ROW_W  = 720;
  const CW     = (ROW_W - PAD * 2 - 36) / NOTES_PER_ROW;
  const totalH = rows.length * (ROW_H + 16) + 8;
  const totalBars = rows.length * BARS_PER_ROW;
  const chords = showChords ? generateChords(seed, totalBars) : [];

  // 在线预览用内联 SVG 和弦框图（每小节一个，宽 40px 高 44px）
  const CHORD_DIAGRAMS: Record<string, number[]> = {
    C:[-1,3,2,0,1,0], Am:[-1,0,2,2,1,0], F:[1,1,2,3,3,1],
    G:[3,2,0,0,0,3], Em:[0,2,2,0,0,0], Dm:[-1,-1,0,2,3,1],
    G7:[3,2,0,0,0,1], "C/E":[-1,3,2,0,1,0],
  };

  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      <View style={{ width: "100%" }}>
        <Svg width="100%" height={totalH} viewBox={`0 0 ${ROW_W} ${totalH}`} preserveAspectRatio="xMinYMin meet">
          {rows.map((rowNotes, rowIdx) => {
            const rowY    = rowIdx * (ROW_H + 16);
            const barOff  = rowIdx * BARS_PER_ROW;
            const stY     = rowY + CHORD_H;
            const lineYs  = [stY + 10, stY + 22, stY + 34, stY + 46, stY + 58];
            return (
              <>
                {/* 和弦框图 */}
                {showChords ? Array.from({ length: BARS_PER_ROW }).map((_, b) => {
                  const chord = chords[barOff + b] ?? "";
                  const bx    = PAD + 38 + b * (CW * NOTES_PER_BAR);
                  const by    = rowY + 4;
                  const frets = CHORD_DIAGRAMS[chord] ?? [];
                  const fw = 40; const fh = 44; const sw = fw / 5; const sfh = fh / 3;
                  return (
                    <>
                      <SvgText key={`cn${rowIdx}_${b}`} x={bx + fw / 2} y={by - 2} textAnchor="middle" fontFamily="sans-serif" fontSize={9} fontWeight="bold" fill="#0066cc">{chord}</SvgText>
                      {/* 竖线 */}
                      {[0,1,2,3,4,5].map((si) => (
                        <SvgLine key={`csv${rowIdx}_${b}_${si}`} x1={bx + si * sw} y1={by} x2={bx + si * sw} y2={by + fh} stroke="#555" strokeWidth={1} />
                      ))}
                      {/* 横线 */}
                      {[0,1,2,3].map((fi) => (
                        <SvgLine key={`csh${rowIdx}_${b}_${fi}`} x1={bx} y1={by + fi * sfh} x2={bx + fw} y2={by + fi * sfh} stroke="#555" strokeWidth={fi === 0 ? 2.5 : 1} />
                      ))}
                      {/* 音符点 */}
                      {frets.map((f, si) => {
                        const cx2 = bx + (5 - si) * sw;
                        if (f === -1) return <SvgText key={`cx${rowIdx}_${b}_${si}`} x={cx2} y={by - 4} textAnchor="middle" fontSize={8} fill="#cc0000">✕</SvgText>;
                        if (f === 0)  return <Circle key={`co${rowIdx}_${b}_${si}`} cx={cx2} cy={by - 5} r={3} fill="none" stroke="#555" strokeWidth={1} />;
                        return <Circle key={`cf${rowIdx}_${b}_${si}`} cx={cx2} cy={by + (f - 0.5) * sfh} r={4} fill="#0066cc" />;
                      })}
                    </>
                  );
                }) : null}
                {/* 五条横线 */}
                {lineYs.map((ly) => (
                  <SvgLine key={`l${rowIdx}_${ly}`} x1={PAD} y1={ly} x2={ROW_W - PAD} y2={ly} stroke={C.foreground} strokeWidth={1} />
                ))}
                {/* 谱号竖线 + 高音谱号 */}
                <SvgLine key={`vl${rowIdx}`} x1={PAD + 2} y1={lineYs[0]} x2={PAD + 2} y2={lineYs[4]} stroke={C.foreground} strokeWidth={2} />
                <SvgText key={`clef${rowIdx}`} x={PAD + 5} y={lineYs[1] + 26} fontFamily="serif" fontSize={50} fill={C.foreground}>𝄞</SvgText>
                {rowNotes.map((n, i) => {
                  const cx = PAD + 38 + i * CW + CW / 2;
                  const digit = Number(n.replace(/\D/g, "") || "4");
                  const noteY = Math.max(lineYs[0] - 6, Math.min(lineYs[4] + 8, lineYs[4] - (digit - 1) * 6));
                  const nm = showNoteNames ? noteToName(n) : "";
                  return (
                    <>
                      {i > 0 && i % NOTES_PER_BAR === 0 ? (
                        <SvgLine key={`bar${rowIdx}_${i}`} x1={cx - CW / 2} y1={lineYs[0]} x2={cx - CW / 2} y2={lineYs[4]} stroke={C.border} strokeWidth={1} />
                      ) : null}
                      <Ellipse key={`e${rowIdx}_${i}`} cx={cx} cy={noteY} rx={5.5} ry={4} fill={C.orange} />
                      <SvgLine key={`st${rowIdx}_${i}`} x1={cx + 5} y1={noteY} x2={cx + 5} y2={noteY - 20} stroke={C.orange} strokeWidth={1.5} />
                      {noteY < lineYs[0] - 2 ? <SvgLine key={`al${rowIdx}_${i}`} x1={cx - 8} y1={lineYs[0]} x2={cx + 8} y2={lineYs[0]} stroke={C.foreground} strokeWidth={1} /> : null}
                      {noteY > lineYs[4] + 2 ? <SvgLine key={`bl2${rowIdx}_${i}`} x1={cx - 8} y1={lineYs[4]} x2={cx + 8} y2={lineYs[4]} stroke={C.foreground} strokeWidth={1} /> : null}
                      {/* 音名标注 */}
                      {nm ? <SvgText key={`nm${rowIdx}_${i}`} x={cx} y={lineYs[4] + 13} textAnchor="middle" fontFamily="sans-serif" fontSize={9} fontWeight="bold" fill="#0066cc">{nm}</SvgText> : null}
                    </>
                  );
                })}
                {rowIdx === rows.length - 1 ? (
                  <>
                    <SvgLine x1={PAD + 38 + rowNotes.length * CW}     y1={lineYs[0]} x2={PAD + 38 + rowNotes.length * CW}     y2={lineYs[4]} stroke={C.foreground} strokeWidth={2.5} />
                    <SvgLine x1={PAD + 38 + rowNotes.length * CW + 4} y1={lineYs[0]} x2={PAD + 38 + rowNotes.length * CW + 4} y2={lineYs[4]} stroke={C.foreground} strokeWidth={1} />
                  </>
                ) : null}
              </>
            );
          })}
        </Svg>
      </View>
    </ScrollView>
  );
}

// ─── 吉他六线谱（多行）────────────────────────────────────────────────────────
export function GuitarTab({
  frets,
  showChords = false,
  seed = "",
}: {
  frets: string[];
  showChords?: boolean;
  seed?: string;
}) {
  const C = useColors();
  const rows    = chunkRows(frets, NOTES_PER_ROW);
  const CHORD_H = showChords ? 58 : 0;
  const ROW_H   = 100 + CHORD_H;
  const PAD     = 8;
  const ROW_W   = 720;
  const CW      = (ROW_W - PAD * 2 - 22) / NOTES_PER_ROW;
  const totalH  = rows.length * (ROW_H + 16) + 8;
  const totalBars = rows.length * BARS_PER_ROW;
  const chords  = showChords ? generateChords(seed, totalBars) : [];

  const CHORD_DIAGRAMS: Record<string, number[]> = {
    C:[-1,3,2,0,1,0], Am:[-1,0,2,2,1,0], F:[1,1,2,3,3,1],
    G:[3,2,0,0,0,3], Em:[0,2,2,0,0,0], Dm:[-1,-1,0,2,3,1],
    G7:[3,2,0,0,0,1], "C/E":[-1,3,2,0,1,0],
  };

  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      <View style={{ width: "100%" }}>
        <Svg width="100%" height={totalH} viewBox={`0 0 ${ROW_W} ${totalH}`} preserveAspectRatio="xMinYMin meet">
          {rows.map((rowFrets, rowIdx) => {
            const rowY     = rowIdx * (ROW_H + 16);
            const barOff   = rowIdx * BARS_PER_ROW;
            const tabY     = rowY + CHORD_H;
            const strGap   = (ROW_H - CHORD_H - 16) / 5;
            const stringYs = [0,1,2,3,4,5].map((s) => tabY + 8 + s * strGap);
            return (
              <>
                {/* 和弦框图 */}
                {showChords ? Array.from({ length: BARS_PER_ROW }).map((_, b) => {
                  const chord = chords[barOff + b] ?? "";
                  const bx    = PAD + 22 + b * (CW * NOTES_PER_BAR);
                  const by    = rowY + 4;
                  const fretArr = CHORD_DIAGRAMS[chord] ?? [];
                  const fw = 40; const fh = 44; const sw = fw / 5; const sfh = fh / 3;
                  return (
                    <>
                      <SvgText key={`cn${rowIdx}_${b}`} x={bx + fw/2} y={by - 2} textAnchor="middle" fontFamily="sans-serif" fontSize={9} fontWeight="bold" fill="#0066cc">{chord}</SvgText>
                      {[0,1,2,3,4,5].map((si) => (
                        <SvgLine key={`gv${rowIdx}_${b}_${si}`} x1={bx + si*sw} y1={by} x2={bx + si*sw} y2={by + fh} stroke="#555" strokeWidth={1} />
                      ))}
                      {[0,1,2,3].map((fi) => (
                        <SvgLine key={`gh${rowIdx}_${b}_${fi}`} x1={bx} y1={by + fi*sfh} x2={bx + fw} y2={by + fi*sfh} stroke="#555" strokeWidth={fi === 0 ? 2.5 : 1} />
                      ))}
                      {fretArr.map((f, si) => {
                        const cx2 = bx + (5 - si) * sw;
                        if (f === -1) return <SvgText key={`gx${rowIdx}_${b}_${si}`} x={cx2} y={by-4} textAnchor="middle" fontSize={8} fill="#cc0000">✕</SvgText>;
                        if (f === 0)  return <Circle key={`go${rowIdx}_${b}_${si}`} cx={cx2} cy={by-5} r={3} fill="none" stroke="#555" strokeWidth={1} />;
                        return <Circle key={`gf${rowIdx}_${b}_${si}`} cx={cx2} cy={by + (f - 0.5)*sfh} r={4} fill="#0066cc" />;
                      })}
                    </>
                  );
                }) : null}
                {/* 六条弦线 */}
                {stringYs.map((sy, si) => (
                  <SvgLine key={`s${rowIdx}_${si}`} x1={PAD} y1={sy} x2={ROW_W - PAD} y2={sy} stroke={C.foreground} strokeWidth={si >= 4 ? 2 : 1} />
                ))}
                <SvgText key={`T${rowIdx}`} x={PAD + 3} y={stringYs[1] + 5} fontFamily="monospace" fontSize={12} fontWeight="bold" fill={C.muted}>T</SvgText>
                <SvgText key={`A${rowIdx}`} x={PAD + 3} y={stringYs[2] + 5} fontFamily="monospace" fontSize={12} fontWeight="bold" fill={C.muted}>A</SvgText>
                <SvgText key={`B${rowIdx}`} x={PAD + 3} y={stringYs[3] + 5} fontFamily="monospace" fontSize={12} fontWeight="bold" fill={C.muted}>B</SvgText>
                {rowFrets.map((f, i) => {
                  const cx = PAD + 22 + i * CW + CW / 2;
                  const strIdx = i % 2 === 0 ? 4 : 5;
                  const sy = stringYs[strIdx];
                  const tw = f.length > 1 ? 13 : 9;
                  return (
                    <>
                      {i > 0 && i % NOTES_PER_BAR === 0 ? (
                        <SvgLine key={`bar${rowIdx}_${i}`} x1={cx - CW/2} y1={stringYs[0] - 4} x2={cx - CW/2} y2={stringYs[5] + 4} stroke={C.border} strokeWidth={1} />
                      ) : null}
                      <SvgRect key={`bg${rowIdx}_${i}`} x={cx - tw/2 - 1} y={sy - 10} width={tw + 2} height={14} fill="white" />
                      <SvgText key={`f${rowIdx}_${i}`} x={cx} y={sy + 3} textAnchor="middle" fontFamily="monospace" fontSize={13} fontWeight="bold" fill={C.cyan}>{f}</SvgText>
                    </>
                  );
                })}
                {rowIdx === rows.length - 1 ? (
                  <>
                    <SvgLine x1={PAD + 22 + rowFrets.length * CW}     y1={stringYs[0]} x2={PAD + 22 + rowFrets.length * CW}     y2={stringYs[5]} stroke={C.foreground} strokeWidth={2.5} />
                    <SvgLine x1={PAD + 22 + rowFrets.length * CW + 4} y1={stringYs[0]} x2={PAD + 22 + rowFrets.length * CW + 4} y2={stringYs[5]} stroke={C.foreground} strokeWidth={1} />
                  </>
                ) : null}
              </>
            );
          })}
        </Svg>
      </View>
    </ScrollView>
  );
}

// ─── 钢琴双五线谱（多行）─────────────────────────────────────────────────────
export function PianoSheet({ notes }: { notes: string[] }) {
  const C = useColors();
  const rows   = chunkRows(notes, NOTES_PER_ROW);
  const ROW_H  = 130;
  const PAD    = 8;
  const ROW_W  = 720;
  const CW     = (ROW_W - PAD * 2 - 36) / NOTES_PER_ROW;
  const totalH = rows.length * (ROW_H + 20) + 8;

  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      <View style={{ width: "100%" }}>
        <Svg width="100%" height={totalH} viewBox={`0 0 ${ROW_W} ${totalH}`} preserveAspectRatio="xMinYMin meet">
          {rows.map((rowNotes, rowIdx) => {
            const rowY    = rowIdx * (ROW_H + 20);
            const topL    = [rowY + 4, rowY + 14, rowY + 24, rowY + 34, rowY + 44];
            const botL    = [rowY + 68, rowY + 78, rowY + 88, rowY + 98, rowY + 108];
            return (
              <>
                {[...topL, ...botL].map((ly) => (
                  <SvgLine key={`l${rowIdx}_${ly}`} x1={PAD} y1={ly} x2={ROW_W - PAD} y2={ly} stroke={C.foreground} strokeWidth={1} />
                ))}
                <SvgLine key={`vl${rowIdx}`} x1={PAD + 2} y1={topL[0]} x2={PAD + 2} y2={botL[4]} stroke={C.foreground} strokeWidth={2} />
                <SvgText key={`clefG${rowIdx}`} x={PAD + 5} y={topL[1] + 24} fontFamily="serif" fontSize={46} fill={C.foreground}>𝄞</SvgText>
                <SvgText key={`clefF${rowIdx}`} x={PAD + 5} y={botL[1] + 12} fontFamily="serif" fontSize={36} fill={C.foreground}>𝄢</SvgText>
                {rowNotes.map((n, i) => {
                  const cx = PAD + 38 + i * CW + CW / 2;
                  const digit = Number(n.replace(/\D/g, "") || "4");
                  const useTop = i % 2 === 0;
                  const lines  = useTop ? topL : botL;
                  const noteY  = Math.max(lines[0] - 4, Math.min(lines[4] + 4, lines[4] - (digit - 1) * 5));
                  const fc     = useTop ? C.orange : "#cc8844";
                  return (
                    <>
                      {i > 0 && i % NOTES_PER_BAR === 0 ? (
                        <SvgLine key={`bar${rowIdx}_${i}`} x1={cx - CW / 2} y1={topL[0]} x2={cx - CW / 2} y2={botL[4]} stroke={C.border} strokeWidth={1} />
                      ) : null}
                      <Ellipse key={`e${rowIdx}_${i}`} cx={cx} cy={noteY} rx={5} ry={3.5} fill={fc} />
                      <SvgLine key={`st${rowIdx}_${i}`} x1={cx + 5} y1={noteY} x2={cx + 5} y2={noteY - 18} stroke={fc} strokeWidth={1.5} />
                    </>
                  );
                })}
                {rowIdx === rows.length - 1 ? (
                  <>
                    <SvgLine x1={PAD + 38 + rowNotes.length * CW}     y1={topL[0]} x2={PAD + 38 + rowNotes.length * CW}     y2={botL[4]} stroke={C.foreground} strokeWidth={2.5} />
                    <SvgLine x1={PAD + 38 + rowNotes.length * CW + 4} y1={topL[0]} x2={PAD + 38 + rowNotes.length * CW + 4} y2={botL[4]} stroke={C.foreground} strokeWidth={1} />
                  </>
                ) : null}
              </>
            );
          })}
        </Svg>
      </View>
    </ScrollView>
  );
}