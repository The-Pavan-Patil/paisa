import { describe, expect, it } from "vitest";
import { buildCsv } from "./csv";

describe("buildCsv", () => {
  it("escapes commas and quotes", () => {
    const csv = buildCsv(
      ["a", "b"],
      [
        [1, "ok"],
        [2, 'say, "hi"'],
      ],
    );
    expect(csv).toContain("\"say, \"\"hi\"\"\"");
  });
});
