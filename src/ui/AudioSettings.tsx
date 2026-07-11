// Speaker button + popover: master mute and separate music/sfx sliders.

import { useEffect, useState } from "preact/hooks";
import { getPrefs, onPrefsChange, updatePrefs, type AudioPrefs } from "./audio";
import { sfx } from "./fx";

export function AudioSettings({ inline = false }: { inline?: boolean }) {
  const [prefs, setPrefs] = useState<AudioPrefs>(getPrefs());
  const [open, setOpen] = useState(false);
  useEffect(() => onPrefsChange(setPrefs), []);

  const slider = (
    label: string,
    value: number,
    key: "music" | "sfx",
    onCommit?: () => void,
  ) => (
    <label class="audio-row">
      <span>{label}</span>
      <input
        type="range"
        min="0"
        max="100"
        value={Math.round(value * 100)}
        onInput={(e) =>
          updatePrefs({ [key]: +(e.currentTarget as HTMLInputElement).value / 100 })
        }
        onChange={onCommit}
      />
    </label>
  );

  return (
    <div class={`audio-settings${inline ? " inline" : ""}`}>
      <button
        class={`mute${prefs.muted ? " muted" : ""}`}
        onClick={() => setOpen(!open)}
        title="Audio settings"
      >
        <span class="mute-glyph">{prefs.muted ? "\u266A\u0338" : "\u266A"}</span>
        {!inline && <span class="mute-label">{prefs.muted ? "muted" : "audio"}</span>}
      </button>
      {open && (
        <>
          <div class="audio-backdrop" onClick={() => setOpen(false)} />
          <div class="audio-pop">
            <button
              class="btn ghost audio-mute-all"
              onClick={() => updatePrefs({ muted: !prefs.muted })}
            >
              {prefs.muted ? "Unmute" : "Mute all"}
            </button>
            {slider("Music", prefs.music, "music")}
            {slider("SFX", prefs.sfx, "sfx", () => sfx.select())}
          </div>
        </>
      )}
    </div>
  );
}
