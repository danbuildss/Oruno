import { describe, expect, it } from "vitest";
import { createLogger, REDACTION_CENSOR } from "../../src/logger.js";
import { LogCapture } from "../helpers/app.js";

describe("logger redaction", () => {
  it("removes secrets from log output", () => {
    const capture = new LogCapture();
    const logger = createLogger({ level: "info" }, capture);
    const secrets = {
      authorization: "Bearer oru_op_TOPSECRETVALUE1",
      apiKey: "TOPSECRETVALUE2",
      databaseUrl: "postgres://u:TOPSECRETVALUE3@h/db",
      nested: {
        secret: "TOPSECRETVALUE4",
        password: "TOPSECRETVALUE5",
        token: "TOPSECRETVALUE6",
        key: "TOPSECRETVALUE7",
      },
      req: {
        headers: {
          authorization: "Bearer TOPSECRETVALUE8",
          "x-api-key": "TOPSECRETVALUE9",
          cookie: "s=TOPSECRETVALUE10",
        },
      },
    };
    logger.info(secrets, "something happened");

    expect(capture.text).not.toMatch(/TOPSECRETVALUE/);
    expect(capture.text).toContain(REDACTION_CENSOR);
    expect(capture.text).toContain("something happened");
  });
});
