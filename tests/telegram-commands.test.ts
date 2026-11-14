import { describe, expect, it } from "vitest";
import { BOT_COMMANDS, commandReply, commandWord, NOT_A_COMMAND } from "@/lib/telegram-commands";

const SITE = "https://modelspawn.test";

describe("bot commands", () => {
  it("every command in the menu has an answer, and every answer link stays on the site (or Discord)", () => {
    for (const { command } of BOT_COMMANDS) {
      const reply = commandReply(`/${command}`, SITE);
      expect(reply, command).not.toBeNull();
      for (const b of reply?.buttons ?? []) expect(b.url).toMatch(/^https:\/\/(modelspawn\.test|discord\.gg)\//);
    }
  });

  it("the menu has no duplicates and fits Telegram's limits", () => {
    const names = BOT_COMMANDS.map((c) => c.command);
    expect(new Set(names).size).toBe(names.length);
    for (const c of BOT_COMMANDS) {
      expect(c.command).toMatch(/^[a-z0-9_]{1,32}$/);
      expect(c.description.length).toBeLessThanOrEqual(256);
    }
  });

  it("/tokens lists every pack with its Stars price; /pro shows the plan", () => {
    const tokens = commandReply("/tokens", SITE)?.text ?? "";
    expect(tokens).toContain("525 tokens");
    expect(tokens).toContain("⭐ 1,500");
    const pro = commandReply("/pro", SITE)?.text ?? "";
    expect(pro).toContain("$9.99");
    expect(pro).toContain("⭐ 500");
  });

  it("/tools names the tools without repeating any", () => {
    const text = commandReply("/tools", SITE)?.text ?? "";
    for (const name of ["Create Model", "Characters", "Inject", "Director", "Variants", "Likeness", "Art to Real"]) expect(text).toContain(name);
    expect(text.match(/Inject/g)).toHaveLength(1);
  });

  it("/support is general help and /paysupport is about payments, so they differ", () => {
    expect(commandReply("/terms", SITE)?.text).toContain(`${SITE}/terms`);
    const support = commandReply("/support", SITE);
    const pay = commandReply("/paysupport", SITE);
    expect(support?.text).toContain("FAQ");
    expect(support?.text).toContain("/paysupport");
    expect(pay?.text).toContain("receipt");
    expect(pay?.text).toContain("modelspawn@gmail.com");
    expect(support?.text).not.toEqual(pay?.text);
    expect(BOT_COMMANDS.find((c) => c.command === "support")?.description).not.toEqual(BOT_COMMANDS.find((c) => c.command === "paysupport")?.description);
  });

  it("reads the command word from messy text and ignores unknown ones", () => {
    expect(commandWord("  /Tokens@ModelSpawnBot please ")).toBe("/tokens");
    expect(commandWord("hello there")).toBe("hello");
    expect(commandReply("/nope", SITE)).toBeNull();
    expect(NOT_A_COMMAND.text).toContain("/help");
  });
});
