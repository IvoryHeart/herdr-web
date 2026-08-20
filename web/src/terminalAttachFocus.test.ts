// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { shouldRestoreTerminalFocus } from "./terminalAttachFocus";

afterEach(() => {
  document.body.replaceChildren();
});

describe("terminal attach focus guard", () => {
  it("does not refocus the terminal after an external control wins focus during attach", () => {
    const terminal = document.createElement("div");
    terminal.tabIndex = 0;
    const control = document.createElement("button");
    document.body.append(terminal, control);
    terminal.focus();
    const attachSnapshot = {
      target: document.activeElement,
      externalFocusSequence: 0,
    };

    control.focus();

    expect(
      shouldRestoreTerminalFocus({
        autoFocus: true,
        currentTarget: control,
        currentExternalFocusSequence: 1,
        attachSnapshot,
      }),
    ).toBe(false);
  });

  it("restores focus only when the attach-time focus state is unchanged", () => {
    const terminal = document.createElement("div");
    const attachSnapshot = {
      target: terminal,
      externalFocusSequence: 4,
    };

    expect(
      shouldRestoreTerminalFocus({
        autoFocus: true,
        currentTarget: terminal,
        currentExternalFocusSequence: 4,
        attachSnapshot,
      }),
    ).toBe(true);
    expect(
      shouldRestoreTerminalFocus({
        autoFocus: false,
        currentTarget: terminal,
        currentExternalFocusSequence: 4,
        attachSnapshot,
      }),
    ).toBe(false);
  });
});
