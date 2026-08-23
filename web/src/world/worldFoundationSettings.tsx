import { useState } from "react";
import type { SurfaceHostV1 } from "@herdr-world/foundation/surfaces";
import {
  readWorldLongRoomTitleMode,
  readWorldRoomAlignment,
  writeWorldLayoutSettings,
} from "./worldSettings";
import type { OfficeLongRoomTitleMode, OfficeRoomAlignment } from "./officeGeometry";

export type WorldSettingsContext = { host: SurfaceHostV1 };

export function WorldFoundationSettings({
  context,
  onClose,
}: {
  context: WorldSettingsContext;
  onClose: () => void;
}) {
  const [roomAlignment, setRoomAlignment] = useState<OfficeRoomAlignment>(readWorldRoomAlignment);
  const [longRoomTitleMode, setLongRoomTitleMode] = useState<OfficeLongRoomTitleMode>(readWorldLongRoomTitleMode);
  const [message, setMessage] = useState<string | null>(null);
  const save = () => {
    writeWorldLayoutSettings({ roomAlignment, longRoomTitleMode });
    window.dispatchEvent(new Event("herdr-world-settings-changed"));
    setMessage(`Saved for ${context.host.availableRuntimes.length} configured host${context.host.availableRuntimes.length === 1 ? "" : "s"}.`);
  };
  return (
    <div className="modal-backdrop" role="dialog" aria-label="World settings">
      <form className="modal world-settings-modal" onSubmit={(event) => { event.preventDefault(); save(); }}>
        <header className="modal-header"><h2>World settings</h2><button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>×</button></header>
        <div className="modal-content world-settings-content">
          <label className="field-label"><span>Room alignment</span><select className="field" value={roomAlignment} onChange={(event) => setRoomAlignment(event.target.value as OfficeRoomAlignment)}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label>
          <label className="field-label"><span>Long room titles</span><select className="field" value={longRoomTitleMode} onChange={(event) => setLongRoomTitleMode(event.target.value as OfficeLongRoomTitleMode)}><option value="expand">Expand long room titles</option><option value="compact">Compact long room titles</option></select></label>
          {message ? <p role="status">{message}</p> : null}
        </div>
        <footer className="modal-actions"><button type="button" className="btn" onClick={onClose}>Cancel</button><button type="submit" className="btn btn-primary">Save</button></footer>
      </form>
    </div>
  );
}
