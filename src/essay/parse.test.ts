import { describe, expect, it } from "vitest";
import { parseEssayReview } from "./parse";

 describe("作文批改解析", () => {
  it("解析围栏和尾逗号，按严重程度与位置排序并保留修改建议", () => {
    const result = parseEssayReview(`说明\n\`\`\`json
    {"issues":[
      {"severity":"low","type":"spelling","position":"第2段第1句","original":"enviroment","correction":"environment","reason":"拼写错误"},
      {"severity":"high","category":"grammar","location":"第1段第2句","original":"He go","suggestion":"He goes","explanation":"主谓一致"},
      {"severity":"medium","category":"collocation","location":"第1段第1句","original":"discuss about","suggestion":"discuss","explanation":"搭配多余"},
      {"severity":"high","category":"tense","location":"第1段第1句","original":"yesterday I go","suggestion":"yesterday I went","explanation":"时态不一致"},
    ],"polishedEssay":"A polished essay."}\n\`\`\``);
    expect(result.polished).toBe("A polished essay.");
    expect(result.issues.map((issue) => [issue.severity, issue.location])).toEqual([
      ["high", "第1段第1句"],
      ["high", "第1段第2句"],
      ["medium", "第1段第1句"],
      ["low", "第2段第1句"],
    ]);
    expect(result.issues[0]).toMatchObject({ category: "tense", suggestion: "yesterday I went" });
    expect(result.issues[3]).toMatchObject({ category: "spelling", suggestion: "environment" });
  });

  it("没有可用批改与润色内容时拒绝空结果", () => {
    expect(() => parseEssayReview("not json")).toThrow("无法解析");
    expect(() => parseEssayReview('{"issues":[],"polished":""}')).toThrow("没有返回可用");
  });
});
