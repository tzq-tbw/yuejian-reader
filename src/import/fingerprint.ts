/** 试卷文件指纹用于重复导入去重；同一文件再次导入不得重复建卡。 */
export async function sha256Hex(data: ArrayBuffer): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error("当前运行环境不支持计算文件指纹，无法安全去重。");
  }
  const digest = await globalThis.crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}