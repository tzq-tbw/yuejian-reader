import { GlobalWorkerOptions, getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
import { buildDocument } from "./layout";
import type { ExtractedDocument, RawPage, RawTextItem } from "./types";

GlobalWorkerOptions.workerSrc = workerUrl;

export interface ExtractOptions {
  onProgress?: (done: number, total: number) => void;
  signal?: AbortSignal;
}

function abortError(): Error {
  const error = new Error("已取消导入");
  error.name = "AbortError";
  return error;
}

/**
 * PDF.js 文字层提取：只负责“每页有什么字、字在哪里”，不做题型判断。
 * 页数上限与方案中的 Python 基线一致（60 页）。
 */
export async function extractPdf(
  data: ArrayBuffer,
  options: ExtractOptions = {},
): Promise<ExtractedDocument> {
  const loadingTask = getDocument({
    data: new Uint8Array(data.slice(0)),
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: true,
  });
  const onAbort = () => {
    void loadingTask.destroy();
  };
  options.signal?.addEventListener("abort", onAbort, { once: true });

  try {
    const doc = await loadingTask.promise;
    if (options.signal?.aborted) throw abortError();
    if (doc.numPages > 60) {
      throw new Error("PDF 超过 60 页，请先拆成单套试卷。");
    }
    if (!doc.numPages) throw new Error("这个 PDF 没有页面。");

    const pages: RawPage[] = [];
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
      if (options.signal?.aborted) throw abortError();
      const page = await doc.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const items: RawTextItem[] = [];
      for (const item of content.items) {
        if (!("str" in item) || typeof item.str !== "string") continue;
        if (!Array.isArray(item.transform)) continue;
        items.push({
          str: item.str,
          transform: [...item.transform],
          width: item.width,
          height: item.height,
          fontName: item.fontName,
          hasEOL: item.hasEOL,
        });
      }
      pages.push({
        pageNumber,
        width: viewport.width,
        height: viewport.height,
        items,
      });
      page.cleanup();
      options.onProgress?.(pageNumber, doc.numPages);
    }
    return buildDocument(pages);
  } catch (cause) {
    if (options.signal?.aborted) throw abortError();
    const name =
      cause && typeof cause === "object" && "name" in cause
        ? String((cause as { name: unknown }).name)
        : "";
    if (name === "PasswordException") {
      throw new Error("这个 PDF 有密码保护，首版不支持加密试卷。");
    }
    if (name === "InvalidPDFException") {
      throw new Error("无法读取 PDF，请确认文件完整且未损坏。");
    }
    throw cause;
  } finally {
    options.signal?.removeEventListener("abort", onAbort);
    await loadingTask.destroy();
  }
}