/**
 * onnxruntime-react-native 类型声明桩
 * 真实类型由 node_modules/onnxruntime-react-native 提供（安装后自动覆盖）
 */
declare module "onnxruntime-react-native" {
  export type TensorType =
    | "float32" | "float64" | "int8" | "int16" | "int32" | "int64"
    | "uint8" | "uint16" | "uint32" | "uint64" | "bool" | "string";

  export type TensorData =
    | Float32Array | Float64Array | Int8Array | Int16Array | Int32Array
    | Uint8Array | Uint16Array | Uint32Array | BigInt64Array | BigUint64Array
    | string[];

  export declare class Tensor {
    readonly type: TensorType;
    readonly data: TensorData;
    readonly dims: readonly number[];
    constructor(type: TensorType, data: TensorData, dims?: readonly number[]);
  }

  export interface InferenceSessionOptions {
    executionProviders?: Array<"cpu" | "nnapi" | "coreml" | "xnnpack">;
    graphOptimizationLevel?: "disabled" | "basic" | "extended" | "all";
    enableMemPattern?: boolean;
    enableCpuMemArena?: boolean;
    executionMode?: "sequential" | "parallel";
    interOpNumThreads?: number;
    intraOpNumThreads?: number;
  }

  export declare class InferenceSession {
    readonly inputNames: readonly string[];
    readonly outputNames: readonly string[];
    static create(
      pathOrBuffer: string | ArrayBufferLike | Uint8Array,
      options?: InferenceSessionOptions,
    ): Promise<InferenceSession>;
    run(
      feeds: Record<string, Tensor>,
      outputNames?: string[],
    ): Promise<Record<string, Tensor>>;
    release(): Promise<void>;
  }
}
