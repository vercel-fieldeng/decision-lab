import {
  PRESETS,
  PRESET_GROUPS,
  isPresetId,
  type PresetId,
} from "@/lib/presets";
import { Icon } from "./icons";

export function UseCasePicker({
  selected,
  disabled,
  onSelect,
}: {
  selected: PresetId;
  disabled: boolean;
  onSelect: (id: PresetId) => void;
}) {
  return (
    <>
      <nav className="use-case-nav" aria-label="Use cases">
        <h2>Use cases</h2>
        {PRESET_GROUPS.map((group) => (
          <div className="use-case-group" key={group}>
            {group !== "Custom" && <h3>{group}</h3>}
            {PRESETS.filter((preset) => preset.group === group).map(
              (preset) => (
                <button
                  key={preset.id}
                  className={`use-case-option ${selected === preset.id ? "active" : ""}`}
                  aria-current={selected === preset.id ? "true" : undefined}
                  onClick={() => onSelect(preset.id)}
                  disabled={disabled}
                >
                  <span>{preset.label}</span>
                  <Icon
                    name={
                      preset.id === "custom"
                        ? "plus"
                        : preset.mode === "image"
                          ? "image"
                          : preset.mode === "json"
                            ? "braces"
                            : "text"
                    }
                    size={14}
                  />
                </button>
              ),
            )}
          </div>
        ))}
      </nav>
      <label className="use-case-mobile">
        <span>Use case</span>
        <span className="use-case-select">
          <select
            value={selected}
            disabled={disabled}
            onChange={(event) => {
              if (isPresetId(event.target.value)) onSelect(event.target.value);
            }}
          >
            {PRESET_GROUPS.map((group) => (
              <optgroup label={group} key={group}>
                {PRESETS.filter((preset) => preset.group === group).map(
                  (preset) => (
                    <option value={preset.id} key={preset.id}>
                      {preset.label}
                    </option>
                  ),
                )}
              </optgroup>
            ))}
          </select>
          <Icon name="chevron" size={14} />
        </span>
      </label>
    </>
  );
}
