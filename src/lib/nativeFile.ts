/** A local file as React Native's networking expects it (it streams the file from `uri`). */
export interface NativeFile {
  uri: string;
  type: string;
  name: string;
}

/**
 * React Native's XMLHttpRequest.send and FormData.append accept a `{ uri, type, name }` file
 * descriptor, which the DOM typings do not model. This is the one place that bridges the two.
 */
export function nativeFile(file: NativeFile): Blob {
  return file as unknown as Blob;
}
