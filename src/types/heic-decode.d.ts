/**
 * `heic-decode` ships no type declarations (CommonJS, `module.exports =
 * decode` with a `.all` attached). This mirrors its README API:
 * https://github.com/catdad-experiments/heic-decode
 */
declare module 'heic-decode' {
  export interface HeicImage {
    /** Integer width of the decoded image. */
    width: number;
    /** Integer height of the decoded image. */
    height: number;
    /** RGBA pixel data, width * height * 4 bytes. */
    data: Uint8ClampedArray;
  }

  export interface HeicDecodeOptions {
    buffer: ArrayBuffer | Uint8Array;
  }

  interface HeicDecodeFunction {
    (options: HeicDecodeOptions): Promise<HeicImage>;
    /** Decode every image in a multi-image HEIC/HEIF file. */
    all(
      options: HeicDecodeOptions,
    ): Promise<Array<{ decode(): Promise<HeicImage> }>>;
  }

  const decode: HeicDecodeFunction;
  export default decode;
}
