export type GuideTopic = "randomizer" | "swapper" | "playlist";

export const ORDERED_GUIDE_TOPICS = ["swapper", "playlist", "randomizer"] as const;

export type GuideStep = {
  stepNumber: number;
  title: string;
  description: string;
  note?: string;
  imageSrc?: string;
};

export type GuideDefinition = {
  topic: GuideTopic;
  tabLabel: string;
  title: string;
  estimatedTime: string;
  steps: GuideStep[];
};

export const GUIDE_DEFINITIONS: Record<GuideTopic, GuideDefinition> = {
  randomizer: {
    topic: "randomizer",
    tabLabel: "Randomizer Settings",
    title: "How to Apply Randomizer Settings",
    estimatedTime: "1–4 mins",
    steps: [
      {
        stepNumber: 1,
        title: "Host a Lobby",
        description: "Start hosting a lobby.",
        imageSrc: "/guide/host-lobby.webp",
      },
      {
        stepNumber: 2,
        title: "Open Randomizer Settings",
        description: "Press checkbox 'Randomise Weapons' in lobby settings and press button 'Randomizer Settings'.",
        imageSrc: "/guide/randomizer-settings.webp",
      },
      {
        stepNumber: 3,
        title: "Clear Weapons",
        description: "Press button 'Toggle' to uncheck all weapons (press again if it enables them).",
        imageSrc: "/guide/randomizer-toggle.webp",
      },
      {
        stepNumber: 4,
        title: "Set Weapon Weights",
        description: "For each weapon from the preset, check the box and enter the weight (yes... it takes time).",
        imageSrc: "/guide/randomizer-weights.webp",
      },
      {
        stepNumber: 5,
        title: "Save Preset",
        description: "Don't forget to press button 'Save Preset'.",
        note: "Do not select any other presets before saving, otherwise changes will be lost.",
        imageSrc: "/guide/randomizer-save.webp",
      },
    ],
  },
  swapper: {
    topic: "swapper",
    tabLabel: "Swapper Settings",
    title: "How to Import Swapper Settings",
    estimatedTime: "< 1 min",
    steps: [
      {
        stepNumber: 1,
        title: "Copy Preset",
        description: "Press button 'Copy' on this preset.",
        imageSrc: "/guide/copy-preset.webp",
      },
      {
        stepNumber: 2,
        title: "Host a Lobby",
        description: "Start hosting a lobby.",
        imageSrc: "/guide/host-lobby.webp",
      },
      {
        stepNumber: 3,
        title: "Open Swapper",
        description: "Press button 'Swapper Settings' (leave checkbox 'Randomise Weapons' unchecked).",
        imageSrc: "/guide/swapper-settings.webp",
      },
      {
        stepNumber: 4,
        title: "Import Preset",
        description: "Press button 'Import Preset'.",
        imageSrc: "/guide/swapper-import.webp",
      },
      {
        stepNumber: 5,
        title: "Select Preset",
        description: "Click on the imported preset in the list to select it.",
        imageSrc: "/guide/swapper-select.webp",
      },
    ],
  },
  playlist: {
    topic: "playlist",
    tabLabel: "Map Playlists",
    title: "How to Import Map Playlists",
    estimatedTime: "< 1 min",
    steps: [
      {
        stepNumber: 1,
        title: "Copy Preset",
        description: "Press button 'Copy' on this preset.",
        imageSrc: "/guide/copy-preset.webp",
      },
      {
        stepNumber: 2,
        title: "Host a Lobby",
        description: "Start hosting a lobby.",
        imageSrc: "/guide/host-lobby.webp",
      },
      {
        stepNumber: 3,
        title: "Open Maps Menu",
        description: "Press button 'Maps' in the top menu (to the left of 'HOME').",
        imageSrc: "/guide/maps-menu.webp",
      },
      {
        stepNumber: 4,
        title: "Import Playlist",
        description: "Press button 'Import' (the imported playlist appears at the end of the list).",
        imageSrc: "/guide/maps-import.webp",
      },
      {
        stepNumber: 5,
        title: "Open Match Maps",
        description: "Press button 'MAPS' at the bottom (to the right of 'START').",
        imageSrc: "/guide/match-maps.webp",
      },
      {
        stepNumber: 6,
        title: "Load Playlist",
        description: "Press button 'Load' and click on the imported Map Playlist.",
        imageSrc: "/guide/maps-load.webp",
      },
    ],
  },
};
