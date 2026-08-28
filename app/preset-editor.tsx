"use client";

import { useMemo, useRef, useState } from "react";
import Image from "next/image";
import { decodeMapPlaylistExport } from "@/src/domain/map-playlist-export";
import { decodeSwapperExport } from "@/src/domain/swapper-export";
import { catalogWeapons, getWeaponImage, weaponAssetUrl } from "@/src/domain/game-weapons";
import { calculateWeaponChances, formatWeaponPercent, MIN_WEAPON_WEIGHT, MAX_WEAPON_WEIGHT } from "@/src/domain/weapon-weights";
import { createEmptyMapPlaylist, createPresetVersionFromPrevious, findPreviousPresetVersion, MAX_MAP_PLAYLIST_DESCRIPTION_CHARACTERS, MAX_MAP_PLAYLISTS, MAX_PRESET_VERSIONS, MAX_RANDOMIZED_WEAPONS, MAX_SWAPPER_CONFIGURATIONS, type PresetMapPlaylistContent, type PresetRevisionContent, type PresetVersionContent, type PresetWeaponConfigurationContent } from "@/src/domain/preset-content";
import { formatPresetVersionLabel, isPresetVersionInRange, isPresetVersionInputCandidate, nextPresetVersionLabel, sortPresetVersionsNewestFirst } from "@/src/domain/preset-version";
import { StraftatText } from "./straftat-text";

type EditorProps = {
  content: PresetRevisionContent;
  activeVersionIndex: number;
  onActiveVersionChange: (index: number) => void;
  onChange: (update: PresetContentUpdate) => void;
  onPendingChange: (task: Promise<void>) => void;
};

export type PresetContentUpdate = PresetRevisionContent | ((content: PresetRevisionContent) => PresetRevisionContent);
type PresetVersionUpdate = PresetVersionContent | ((version: PresetVersionContent) => PresetVersionContent);
type RandomizedWeaponConfiguration = Extract<PresetWeaponConfigurationContent, { kind: "randomized" }>;

export { normalizePresetContent as starterPresetContent } from "@/src/domain/preset-content";

export function PresetContentEditor({ content, activeVersionIndex, onActiveVersionChange, onChange, onPendingChange }: EditorProps) {
  const [newVersionLabel, setNewVersionLabel] = useState<string | null>(null);
  const [editingVersionIndex, setEditingVersionIndex] = useState<number | null>(null);
  const [editingVersionValue, setEditingVersionValue] = useState<string>("");
  const isRenameCancelledRef = useRef(false);
  const versions = sortPresetVersionsNewestFirst(content.versions);
  const safeIndex = Math.min(activeVersionIndex, Math.max(0, versions.length - 1));
  const version = versions[safeIndex];
  const versioningEnabled = content.versioningEnabled;

  const updateVersion = (update: PresetVersionUpdate) => {
    const targetLabel = version.label;
    onChange((currentContent) => {
      const currentVersion = currentContent.versions.find((item) => item.label === targetLabel);
      if (!currentVersion) return currentContent;
      const next = typeof update === "function" ? update(currentVersion) : update;
      return {
        ...currentContent,
        versions: sortPresetVersionsNewestFirst(currentContent.versions.map((item) => item === currentVersion ? next : item)),
      };
    });
  };
  const beginVersion = () => {
    if (!versioningEnabled || content.versions.length >= MAX_PRESET_VERSIONS) return;
    const label = nextPresetVersionLabel(content.versions.map((item) => item.label));
    if (!label) return;
    setEditingVersionIndex(null);
    setNewVersionLabel(formatPresetVersionLabel(label));
  };
  const addVersion = (rawLabel = newVersionLabel) => {
    if (!rawLabel || !isPresetVersionInRange(rawLabel) || content.versions.length >= MAX_PRESET_VERSIONS) return;
    const label = formatPresetVersionLabel(rawLabel);
    if (content.versions.some((item) => item.label.toLocaleLowerCase("en-US") === label.toLocaleLowerCase("en-US"))) return;
    const previousVersion = findPreviousPresetVersion(label, content.versions);
    const added = createPresetVersionFromPrevious(label, previousVersion);
    const sorted = sortPresetVersionsNewestFirst([...content.versions, added]);
    onChange({ ...content, versions: sorted });
    onActiveVersionChange(sorted.indexOf(added));
    setNewVersionLabel(null);
  };
  const removeVersion = () => {
    const remaining = sortPresetVersionsNewestFirst(content.versions.filter((item) => item !== version));
    onChange({ ...content, versions: remaining });
    onActiveVersionChange(0);
  };

  const startEditingVersion = (index: number, currentLabel: string) => {
    if (!versioningEnabled) return;
    isRenameCancelledRef.current = false;
    setNewVersionLabel(null);
    setEditingVersionIndex(index);
    setEditingVersionValue(formatPresetVersionLabel(currentLabel));
  };

  const commitVersionRename = (index: number, targetVersion: PresetVersionContent) => {
    if (editingVersionIndex !== index) return;
    const rawValue = editingVersionValue.trim();
    if (isPresetVersionInRange(rawValue)) {
      const formatted = formatPresetVersionLabel(rawValue);
      const isDuplicate = versions.some(
        (item, itemIdx) => itemIdx !== index && item.label.toLocaleLowerCase("en-US") === formatted.toLocaleLowerCase("en-US")
      );
      if (!isDuplicate && formatted !== targetVersion.label) {
        const renamed = { ...targetVersion, label: formatted };
        const sorted = sortPresetVersionsNewestFirst(
          content.versions.map((item) => (item === targetVersion ? renamed : item))
        );
        onChange({ ...content, versions: sorted });
        onActiveVersionChange(Math.max(0, sorted.indexOf(renamed)));
      }
    }
    setEditingVersionIndex(null);
  };

  if (!version) {
    return <section className="editor-empty"><p>Add a version to start entering playlists and weapons.</p><button type="button" onClick={() => addVersion("v1.0.0")}>＋ Add version</button></section>;
  }

  return (
    <div className="preset-content-editor">
      <div className="editor-version-tabs" role="tablist" aria-label="Preset versions">
        {(!versioningEnabled || versions.length === 1) ? <button
          className={`editor-versioning-toggle ${versioningEnabled ? "active" : ""}`}
          type="button"
          aria-pressed={versioningEnabled}
          title={versioningEnabled ? "Disable versioning" : "Enable versioning"}
          onClick={() => {
            setNewVersionLabel(null);
            setEditingVersionIndex(null);
            onActiveVersionChange(0);
            onChange({ ...content, versioningEnabled: !versioningEnabled });
          }}
        >
          <span>Versions</span>
          <span className="editor-versioning-switch" aria-hidden="true" />
        </button> : null}
        {(versioningEnabled ? versions : versions.slice(0, 1)).map((item, index) => {
          const isEditing = editingVersionIndex === index;
          if (isEditing) {
            return (
              <div className="editor-rename-version-wrap" key={item.label}>
                <input
                  className="editor-add-version-input editor-rename-version-input"
                  autoFocus
                  aria-label="Rename preset version"
                  aria-invalid={!isPresetVersionInRange(editingVersionValue)}
                  maxLength={15}
                  value={editingVersionValue}
                  onChange={(event) => {
                    if (isPresetVersionInputCandidate(event.target.value)) setEditingVersionValue(event.target.value);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      if (isPresetVersionInRange(editingVersionValue)) {
                        commitVersionRename(index, item);
                        (event.target as HTMLElement).blur();
                      }
                    } else if (event.key === "Escape") {
                      event.preventDefault();
                      event.stopPropagation();
                      isRenameCancelledRef.current = true;
                      setEditingVersionIndex(null);
                    }
                  }}
                  onBlur={() => {
                    if (!isRenameCancelledRef.current) {
                      commitVersionRename(index, item);
                    }
                  }}
                />
                <button
                  type="button"
                  className="editor-add-version-confirm"
                  title="Save version name"
                  disabled={!isPresetVersionInRange(editingVersionValue)}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => commitVersionRename(index, item)}
                >
                  <CheckIcon />
                </button>
                <button
                  type="button"
                  className="editor-add-version-cancel"
                  title="Cancel"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    isRenameCancelledRef.current = true;
                    setEditingVersionIndex(null);
                  }}
                >
                  <CrossIcon />
                </button>
              </div>
            );
          }

          return (
            <button
              className={index === safeIndex ? "active" : ""}
              key={item.label}
              type="button"
              role="tab"
              disabled={!versioningEnabled}
              aria-selected={index === safeIndex}
              title={versioningEnabled ? "Click to select, double-click to rename" : "Enable versioning to edit versions"}
              onClick={() => {
                setNewVersionLabel(null);
                onActiveVersionChange(index);
              }}
              onDoubleClick={() => startEditingVersion(index, item.label)}
            >
              {formatPresetVersionLabel(item.label) || `Version ${index + 1}`}
            </button>
          );
        })}
        {versioningEnabled && (newVersionLabel === null
          ? (versions.length < MAX_PRESET_VERSIONS
              ? <button className="editor-add-version" type="button" aria-label="Add version" onClick={beginVersion}><PlusIcon /></button>
              : null)
          : <div className="editor-add-version-wrap">
              <input
                className="editor-add-version-input"
                autoFocus
                aria-label="New preset version"
                aria-invalid={!isPresetVersionInRange(newVersionLabel)}
                maxLength={15}
                value={newVersionLabel}
                onChange={(event) => {
                  if (isPresetVersionInputCandidate(event.target.value)) setNewVersionLabel(event.target.value);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    if (isPresetVersionInRange(newVersionLabel)) {
                      addVersion(newVersionLabel);
                      (event.target as HTMLElement).blur();
                    }
                  } else if (event.key === "Escape") {
                    event.preventDefault();
                    event.stopPropagation();
                    setNewVersionLabel(null);
                  }
                }}
              />
              <button type="button" className="editor-add-version-confirm" title="Create version" disabled={!isPresetVersionInRange(newVersionLabel)} onClick={() => { if (isPresetVersionInRange(newVersionLabel)) addVersion(newVersionLabel); }}><CheckIcon /></button>
              <button type="button" className="editor-add-version-cancel" title="Cancel" onClick={() => setNewVersionLabel(null)}><CrossIcon /></button>
            </div>)}
        {versioningEnabled && versions.length > 1 ? <ConfirmDeleteButton className="editor-remove-version" label={`Remove ${version.label}`} onConfirm={removeVersion} /> : null}
      </div>

    <WeaponConfigurationPicker version={version} onChange={updateVersion} />
    {version.weaponConfigurations.some(c => c.kind === "randomized") ? <RandomizedWeaponsEditor version={version} onChange={updateVersion} /> : null}
    {version.weaponConfigurations.some(c => c.kind === "swapper") ? <SwapperSettingsEditor version={version} onChange={updateVersion} onPendingChange={onPendingChange} /> : null}
    <MapPlaylistsEditor version={version} onChange={updateVersion} onPendingChange={onPendingChange} />
    <div className="editor-quality-tip">
      <strong>Tip:</strong> Completeness directly affects ranking in <b>Popular</b>. Adding a custom thumbnail, choosing tags, writing a clear description, and setting map pool notes gets your preset ranked higher and makes it easier for players to find and use.
    </div>
  </div>
);
}

function WeaponConfigurationPicker({ version, onChange }: { version: PresetVersionContent; onChange: (update: PresetVersionUpdate) => void }) {
  if (version.weaponConfigurations.length > 0) return null;

  return (
    <section className="editor-block weapon-type-picker">
      <header>
        <h3>Weapons</h3>
      </header>
      <div className="weapon-type-actions">
        <button
          type="button"
          className="weapon-type-button"
          onClick={() => onChange((current) => ({ ...current, weaponConfigurations: [{ kind: "randomized", name: "Randomized weapons", weapons: [] }] }))}
        >
          <DiceIcon />
          <span>Randomized weapons</span>
        </button>
        <button
          type="button"
          className="weapon-type-button"
          onClick={() => onChange((current) => ({ ...current, weaponConfigurations: [{ kind: "swapper", name: "", encodedValue: "" }] }))}
        >
          <SwapIcon />
          <span>Swapper settings</span>
        </button>
      </div>
    </section>
  );
}

function RandomizedWeaponsEditor({ version, onChange }: { version: PresetVersionContent; onChange: (update: PresetVersionUpdate) => void }) {
  const configurationIndex = version.weaponConfigurations.findIndex((configuration) => configuration.kind === "randomized");
  const configuration = configurationIndex >= 0 && version.weaponConfigurations[configurationIndex]?.kind === "randomized"
    ? version.weaponConfigurations[configurationIndex]
    : null;
  const [query, setQuery] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);

  const selectedNames = useMemo(() => new Set(configuration?.weapons.map((weapon) => weapon.name) ?? []), [configuration]);
  const matchingWeapons = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("en-US");
    return catalogWeapons
      .filter((weapon) => !selectedNames.has(weapon.name))
      .filter((weapon) => !term || weapon.name.toLocaleLowerCase("en-US").includes(term));
  }, [query, selectedNames]);

  const updateConfiguration = (
    update: RandomizedWeaponConfiguration | ((configuration: RandomizedWeaponConfiguration) => RandomizedWeaponConfiguration),
  ) => {
    onChange((currentVersion) => {
      const index = currentVersion.weaponConfigurations.findIndex((item) => item.kind === "randomized");
      const current = currentVersion.weaponConfigurations[index];
      if (index < 0 || current?.kind !== "randomized") return currentVersion;
      const next = typeof update === "function" ? update(current) : update;
      return {
        ...currentVersion,
        weaponConfigurations: currentVersion.weaponConfigurations.map((item, itemIndex) => itemIndex === index ? next : item),
      };
    });
  };
  const addWeapon = (name: string) => {
    if (!configuration || selectedNames.has(name) || configuration.weapons.length >= MAX_RANDOMIZED_WEAPONS) return;
    updateConfiguration((current) => current.weapons.some((weapon) => weapon.name === name)
      ? current
      : { ...current, weapons: [...current.weapons, { name, weight: 100 }].sort((left, right) => left.name.localeCompare(right.name)) });
    setQuery("");
    setPickerOpen(false);
    setHighlightedIndex(0);
    requestAnimationFrame(() => {
      const input = document.getElementById(`weapon-weight-${name}`) as HTMLInputElement | null;
      input?.focus();
      input?.select();
    });
  };

  const removeConfiguration = () => {
    onChange((current) => ({ ...current, weaponConfigurations: current.weaponConfigurations.filter((item) => item.kind !== "randomized") }));
  };

  if (!configuration) return null;

  const weaponsWithChance = calculateWeaponChances(configuration.weapons).sort((left, right) => left.name.localeCompare(right.name));
  return <section className="editor-block randomized-editor">
    <header>
      <h3>Randomized weapons <span>{configuration.weapons.length}</span></h3>
      <ConfirmDeleteButton label="Remove randomized weapons" onConfirm={removeConfiguration} />
    </header>
    <div className="weapon-entry">
      <label htmlFor="weapon-search">Add weapon</label>
      <div className="weapon-combobox" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setPickerOpen(false); }}>
        <input ref={searchRef} id="weapon-search" role="combobox" aria-autocomplete="list" aria-controls="weapon-results" aria-expanded={pickerOpen} autoComplete="off" placeholder="Type a weapon name" value={query}
          onFocus={() => setPickerOpen(true)}
          onChange={(event) => { setQuery(event.target.value); setPickerOpen(true); setHighlightedIndex(0); }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") { event.preventDefault(); setPickerOpen(true); setHighlightedIndex((index) => Math.min(index + 1, Math.max(0, matchingWeapons.length - 1))); }
            if (event.key === "ArrowUp") { event.preventDefault(); setHighlightedIndex((index) => Math.max(0, index - 1)); }
            if (event.key === "Enter" && matchingWeapons[highlightedIndex]) { event.preventDefault(); addWeapon(matchingWeapons[highlightedIndex].name); }
            if (event.key === "Escape") setPickerOpen(false);
          }} />
        {pickerOpen && matchingWeapons.length ? <div id="weapon-results" className="weapon-results" role="listbox">
          {matchingWeapons.map((weapon, index) => <button className={index === highlightedIndex ? "active" : ""} type="button" role="option" aria-selected={index === highlightedIndex} key={weapon.name} onMouseDown={(event) => event.preventDefault()} onClick={() => addWeapon(weapon.name)}><Image src={weaponAssetUrl(weapon.image)} alt="" width={44} height={44} /><span>{weapon.name}</span></button>)}
        </div> : null}
      </div>
    </div>

    {weaponsWithChance.length ? <div className="randomized-entry-table" role="table" aria-label="Randomized weapons">
      <div className="randomized-entry-head" role="row"><span role="columnheader">Weapon</span><span role="columnheader">Weight</span><span role="columnheader">Chance</span><span aria-hidden="true" /></div>
      {weaponsWithChance.map((weapon) => <div className="randomized-entry-row" role="row" key={weapon.name}>
        <span className="weapon-entry-name" role="cell"><Image src={getWeaponImage(weapon.name) ?? "/discord-symbol.svg"} alt="" width={34} height={34} /><b>{weapon.name}</b></span>
        <span role="cell"><input id={`weapon-weight-${weapon.name}`} aria-label={`${weapon.name} weight`} inputMode="numeric" min={MIN_WEAPON_WEIGHT} max={MAX_WEAPON_WEIGHT} step={1} type="number" value={weapon.weight !== undefined ? weapon.weight : ""} onFocus={(event) => event.currentTarget.select()} onChange={(event) => { const raw = event.target.value; const num = raw === "" ? 0 : Math.max(MIN_WEAPON_WEIGHT, Math.min(MAX_WEAPON_WEIGHT, Math.floor(Number(raw) || 0))); updateConfiguration((current) => ({ ...current, weapons: current.weapons.map((item) => item.name === weapon.name ? { ...item, weight: num } : item) })); }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); searchRef.current?.focus(); } }} /></span>
        <span role="cell"><span className="chance"><i style={{ width: `${weapon.percent}%` }} />{formatWeaponPercent(weapon.percent)}</span></span>
        <ConfirmDeleteButton label={`Remove ${weapon.name}`} onConfirm={() => updateConfiguration((current) => ({ ...current, weapons: current.weapons.filter((item) => item.name !== weapon.name) }))} />
      </div>)}
    </div> : null}
  </section>;
}

function MapPlaylistsEditor({
  version,
  onChange,
  onPendingChange,
}: {
  version: PresetVersionContent;
  onChange: (update: PresetVersionUpdate) => void;
  onPendingChange: (task: Promise<void>) => void;
}) {
  const [decodeErrors, setDecodeErrors] = useState<Record<number, string>>({});
  const latestEncodedValuesRef = useRef(new Map<number, string>());

  const updatePlaylist = (
    index: number,
    update: PresetMapPlaylistContent | ((playlist: PresetMapPlaylistContent) => PresetMapPlaylistContent),
  ) => {
    onChange((currentVersion) => {
      const playlist = currentVersion.mapPlaylists[index];
      if (!playlist) return currentVersion;
      const next = typeof update === "function" ? update(playlist) : update;
      if (next === playlist) return currentVersion;
      return {
        ...currentVersion,
        mapPlaylists: currentVersion.mapPlaylists.map((item, itemIndex) => itemIndex === index ? next : item),
      };
    });
  };

  const handlePlaylistCodeChange = async (index: number, encodedValue: string) => {
    latestEncodedValuesRef.current.set(index, encodedValue);
    updatePlaylist(index, (playlist) => ({ ...playlist, encodedValue, name: "", mapNames: [] }));
    const trimmed = encodedValue.trim();
    if (!trimmed) {
      setDecodeErrors((current) => {
        if (!current[index]) return current;
        const next = { ...current };
        delete next[index];
        return next;
      });
      return;
    }
    try {
      const decoded = await decodeMapPlaylistExport(trimmed);
      if (latestEncodedValuesRef.current.get(index) !== encodedValue) return;
      updatePlaylist(index, (playlist) => playlist.encodedValue === encodedValue
        ? { ...playlist, encodedValue: trimmed, name: decoded.name, mapNames: decoded.mapNames }
        : playlist);
      setDecodeErrors((current) => {
        if (!current[index]) return current;
        const next = { ...current };
        delete next[index];
        return next;
      });
    } catch (error) {
      if (latestEncodedValuesRef.current.get(index) !== encodedValue) return;
      setDecodeErrors((current) => ({ ...current, [index]: error instanceof Error ? error.message : "Could not decode this playlist." }));
    }
  };

  return <section className="editor-block playlist-editor">
    <header><h3>Map playlists <span>{version.mapPlaylists.length}</span></h3><button className="editor-add-button" type="button" disabled={version.mapPlaylists.length >= MAX_MAP_PLAYLISTS} onClick={() => onChange((current) => current.mapPlaylists.length >= MAX_MAP_PLAYLISTS ? current : { ...current, mapPlaylists: [...current.mapPlaylists, createEmptyMapPlaylist()] })}>＋ Add playlist</button></header>
    <div className="playlist-editor-list">{version.mapPlaylists.map((playlist, index) => <article className="playlist-editor-item" key={index}>
      <header><div><strong><StraftatText text={playlist.name || `Playlist ${index + 1}`} /></strong>{playlist.mapNames.length ? <span>{playlist.mapNames.length} {playlist.mapNames.length === 1 ? "map" : "maps"}</span> : null}</div><ConfirmDeleteButton label={`Remove playlist ${index + 1}`} onConfirm={() => onChange((current) => ({ ...current, mapPlaylists: current.mapPlaylists.filter((_, itemIndex) => itemIndex !== index) }))} /></header>
      <label><textarea spellCheck={false} maxLength={500000} placeholder="Paste the base64 playlist code" value={playlist.encodedValue} onChange={(event) => onPendingChange(handlePlaylistCodeChange(index, event.target.value))} /></label>
      {decodeErrors[index] ? <p className="field-error-message">{decodeErrors[index]}</p> : null}
      <label><span>Short description <b className="field-counter">{playlist.description.length}/{MAX_MAP_PLAYLIST_DESCRIPTION_CHARACTERS}</b></span><input required maxLength={MAX_MAP_PLAYLIST_DESCRIPTION_CHARACTERS} placeholder="Which maps or pacing define this playlist, and why choose it?" value={playlist.description} onChange={(event) => updatePlaylist(index, (current) => ({ ...current, description: event.target.value }))} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); } }} /></label>
    </article>)}</div>
  </section>;
}

function SwapperSettingsEditor({
  version,
  onChange,
  onPendingChange,
}: {
  version: PresetVersionContent;
  onChange: (update: PresetVersionUpdate) => void;
  onPendingChange: (task: Promise<void>) => void;
}) {
  const [decodeErrors, setDecodeErrors] = useState<Record<number, string>>({});
  const latestEncodedValuesRef = useRef(new Map<number, string>());

  const swapperIndices = version.weaponConfigurations
    .map((c, index) => c.kind === "swapper" ? index : -1)
    .filter(index => index !== -1);

  const addSwapper = () => {
    if (version.weaponConfigurations.length >= MAX_SWAPPER_CONFIGURATIONS) return;
    onChange((current) => current.weaponConfigurations.length >= MAX_SWAPPER_CONFIGURATIONS
      ? current
      : { ...current, weaponConfigurations: [...current.weaponConfigurations, { kind: "swapper", name: "", encodedValue: "" }] });
  };

  const updateSwapper = (
    index: number,
    update: PresetWeaponConfigurationContent | ((configuration: PresetWeaponConfigurationContent) => PresetWeaponConfigurationContent),
  ) => {
    onChange((currentVersion) => {
      const configuration = currentVersion.weaponConfigurations[index];
      if (!configuration) return currentVersion;
      const next = typeof update === "function" ? update(configuration) : update;
      if (next === configuration) return currentVersion;
      return {
        ...currentVersion,
        weaponConfigurations: currentVersion.weaponConfigurations.map((item, itemIndex) => itemIndex === index ? next : item),
      };
    });
  };

  const removeSwapper = (index: number) => {
    onChange((current) => ({ ...current, weaponConfigurations: current.weaponConfigurations.filter((_, itemIndex) => itemIndex !== index) }));
  };

  const handleSwapperCodeChange = async (index: number, encodedValue: string) => {
    const configuration = version.weaponConfigurations[index];
    if (configuration.kind !== "swapper") return;
    latestEncodedValuesRef.current.set(index, encodedValue);
    updateSwapper(index, (current) => current.kind === "swapper"
      ? { ...current, encodedValue, name: "" }
      : current);
    const trimmed = encodedValue.trim();
    if (!trimmed) {
      setDecodeErrors((current) => {
        if (!current[index]) return current;
        const next = { ...current };
        delete next[index];
        return next;
      });
      return;
    }
    try {
      const decoded = await decodeSwapperExport(trimmed);
      if (latestEncodedValuesRef.current.get(index) !== encodedValue) return;
      updateSwapper(index, (current) => current.kind === "swapper" && current.encodedValue === encodedValue
        ? { ...current, encodedValue: trimmed, name: decoded.name }
        : current);
      setDecodeErrors((current) => {
        if (!current[index]) return current;
        const next = { ...current };
        delete next[index];
        return next;
      });
    } catch (error) {
      if (latestEncodedValuesRef.current.get(index) !== encodedValue) return;
      setDecodeErrors((current) => ({ ...current, [index]: error instanceof Error ? error.message : "Could not decode swapper." }));
    }
  };

  if (swapperIndices.length === 0) return null;

  return <section className="editor-block playlist-editor">
    <header><h3>Swapper settings <span>{swapperIndices.length}</span></h3><button className="editor-add-button" type="button" disabled={version.weaponConfigurations.length >= MAX_SWAPPER_CONFIGURATIONS} onClick={addSwapper}>＋ Add swapper</button></header>
    <div className="playlist-editor-list">{swapperIndices.map((index, renderIndex) => {
      const configuration = version.weaponConfigurations[index];
      if (configuration.kind !== "swapper") return null;
      return <article className="playlist-editor-item" key={index}>
        <header><div><strong><StraftatText text={configuration.name || `Swapper ${renderIndex + 1}`} /></strong></div><ConfirmDeleteButton label={`Remove swapper ${renderIndex + 1}`} onConfirm={() => removeSwapper(index)} /></header>
        <label><textarea spellCheck={false} maxLength={500000} placeholder="Paste the base64 swapper code" value={configuration.encodedValue} onChange={(event) => onPendingChange(handleSwapperCodeChange(index, event.target.value))} /></label>
        {decodeErrors[index] ? <p className="field-error-message">{decodeErrors[index]}</p> : null}
        <label><span>Short description <b className="field-counter">{(configuration.description?.length ?? 0)}/{MAX_MAP_PLAYLIST_DESCRIPTION_CHARACTERS}</b></span><input maxLength={MAX_MAP_PLAYLIST_DESCRIPTION_CHARACTERS} placeholder="What key weapon swaps happen here, and how does it change the match?" value={configuration.description ?? ""} onChange={(event) => updateSwapper(index, (current) => ({ ...current, description: event.target.value }))} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); } }} /></label>
      </article>;
    })}</div>
  </section>;
}

function ConfirmDeleteButton({ label, onConfirm, className }: { label: string; onConfirm: () => void; className?: string }) {
  const [confirming, setConfirming] = useState(false);
  const blurTimer = useRef<number | null>(null);

  return (
    <button
      className={`editor-delete-btn ${className ?? ""} ${confirming ? "confirming" : ""}`.trim()}
      type="button"
      aria-label={confirming ? "Confirm delete" : label}
      onClick={(e) => {
        e.stopPropagation();
        if (confirming) {
          setConfirming(false);
          onConfirm();
        } else {
          setConfirming(true);
        }
      }}
      onBlur={() => {
        blurTimer.current = window.setTimeout(() => setConfirming(false), 250);
      }}
      onFocus={() => {
        if (blurTimer.current) clearTimeout(blurTimer.current);
      }}
    >
      {confirming ? "Sure?" : "×"}
    </button>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function CrossIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function DiceIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="15.5" cy="15.5" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

function SwapIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M16 3l4 4-4 4" />
      <path d="M20 7H4" />
      <path d="M8 21l-4-4 4-4" />
      <path d="M4 17h16" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}
