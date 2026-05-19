import { describe, expect, it } from "vitest";
import { noOpProvider } from "$lib/server/mail/no-op.js";

describe("noOpProvider", () => {
  it("returns a deterministic messageId without sending", async () => {
    const result = await noOpProvider.send({
      from: "from@x",
      to: "to@x",
      subject: "s",
      html: "<p>h</p>",
      text: "t",
    });
    expect(result.messageId).toMatch(/^noop-/);
  });

  it("does not throw for empty html/text", async () => {
    await expect(
      noOpProvider.send({
        from: "f",
        to: "t",
        subject: "",
        html: "",
        text: "",
      }),
    ).resolves.toBeDefined();
  });
});
