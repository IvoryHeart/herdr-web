export type TerminalAttachFocusSnapshot = {
  target: Element | null;
  externalFocusSequence: number;
};

export function shouldRestoreTerminalFocus(options: {
  autoFocus: boolean;
  currentTarget: Element | null;
  currentExternalFocusSequence: number;
  attachSnapshot: TerminalAttachFocusSnapshot;
}) {
  return (
    options.autoFocus
    && options.currentExternalFocusSequence === options.attachSnapshot.externalFocusSequence
    && options.currentTarget === options.attachSnapshot.target
  );
}
