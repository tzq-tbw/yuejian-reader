import { describe, expect, it, vi } from "vitest";
import { fetchOnlineWordlist, parseOnlineWordlist, validateRawGithubUrl } from "./onlineWordlist";

describe("GitHub 在线词表解析", () => {
  it("四级 CSV 只取 rank 1-1200 并剔除纯功能词", () => {
    const words = parseOnlineWordlist(
      "rank,word,doc_freq,term_freq\n1,the,31,10\n2,Apple,31,9\n3,of,31,8\n4,and,31,7\n5,is,31,6\n6,are,31,5\n7,\"Banana\",30,4\n1200,final,1,1\n1201,ignored,1,1\n",
      "cet4-frequency",
    );
    expect(words).toEqual(["apple", "banana", "final"]);
  });

  it("六级 Markdown 表格解析序号列和粗体单词", () => {
    const words = parseOnlineWordlist(
      "# Top500\n| 序号 | 英文 | 中文意思 |\n|---:|---|---|\n| 1 | **increase** | 增加 |\n| 2 | `require` | 要求 |\n| x | **skipped** | 跳过 |\n",
      "cet6-markdown",
    );
    expect(words).toEqual(["increase", "require"]);
  });

  it("考研逗号文本去重并过滤非单词项", () => {
    const words = parseOnlineWordlist(
      "mercy, metal, BC, 0, be concerned, mercy,re +v,Education\n",
      "postgraduate-comma",
    );
    expect(words).toEqual(["mercy", "metal", "bc", "education"]);
  });

  it("下载 Raw URL 后按指定格式解析", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("one,two", { status: 200 }));
    const result = await fetchOnlineWordlist(
      "https://raw.githubusercontent.com/owner/repo/main/words.txt",
      "postgraduate-comma",
      fetchImpl,
    );
    expect(result.words).toEqual(["one", "two"]);
    expect(fetchImpl).toHaveBeenCalledWith("https://raw.githubusercontent.com/owner/repo/main/words.txt");
  });

  it("拒绝非 GitHub Raw 地址", () => {
    expect(() => validateRawGithubUrl("https://example.com/words.txt")).toThrow("仅支持");
    expect(() => validateRawGithubUrl("not a url")).toThrow("有效的");
  });
});
