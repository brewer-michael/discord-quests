import { describe, expect, it } from "vitest";
import { loadEnv } from "./env";
import { commandRoute } from "./register";

describe("command registration", () => {
  it("registers in the dev guild when one is set, otherwise globally", () => {
    expect(commandRoute("111", "222")).toBe("/applications/111/guilds/222/commands");
    expect(commandRoute("111")).toBe("/applications/111/commands");
    expect(commandRoute("111", undefined)).toBe("/applications/111/commands");
  });

  it("registers at startup unless switched off", () => {
    const base = {
      DISCORD_TOKEN: "token-token-token",
      DISCORD_CLIENT_ID: "123456789",
      DATABASE_URL: "postgres://dq:dq@localhost:5432/dq",
    };
    expect(loadEnv(base).REGISTER_COMMANDS).toBe("true");
    expect(loadEnv({ ...base, REGISTER_COMMANDS: "" }).REGISTER_COMMANDS).toBe("true");
    expect(loadEnv({ ...base, REGISTER_COMMANDS: "false" }).REGISTER_COMMANDS).toBe("false");
    // An empty dev guild id (as copied from .env.example) means global, not a broken route.
    expect(loadEnv({ ...base, DISCORD_DEV_GUILD_ID: "" }).DISCORD_DEV_GUILD_ID).toBeUndefined();
  });
});
