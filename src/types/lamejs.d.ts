declare module "lamejs" {
  export class Mp3Encoder {
    constructor(channels: number, sampleRate: number, kbps: number);
    encodeBuffer(left: Int16Array, right?: Int16Array | null): Int8Array;
    flush(): Int8Array;
  }
  export class WavHeader {
    static readHeader: (view: DataView) => unknown;
  }
}