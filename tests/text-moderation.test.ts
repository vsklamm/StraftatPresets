import assert from "node:assert/strict";
import test from "node:test";
import {
  stripColorAndFormattingTags,
  hasColorOrFormattingTags,
} from "../src/domain/straftat-markup";
import {
  extractModeratableFields,
  getChangedModeratableFields,
} from "../src/lib/moderation/extract-fields";
import {
  checkLevel1Limits,
} from "../src/lib/moderation/level1-limits";
import {
  checkLevel2HardReject,
} from "../src/lib/moderation/level2-hard-reject";
import {
  checkLevel3Computery,
  scanTextForProfanity,
} from "../src/lib/moderation/level3-computery";
import {
  checkLevel4QualityAndLibraries,
  PROFANITY_LANGUAGE_CODES,
} from "../src/lib/moderation/level4-quality-libraries";
import {
  runClientModeration,
  runServerModeration,
  detectLinks,
} from "../src/lib/moderation";
import type { PresetRevisionContent } from "../src/domain/preset-content";

const sampleValidPreset: PresetRevisionContent = {
  title: "Precision Snipers",
  description: "A tactical sniper map rotation with balanced weapon spawns and clean sightlines.",
  thumbnailKey: null,
  tags: ["snipers", "aim"],
  versioningEnabled: false,
  versions: [{
    label: "v1.0.0",
    mapPlaylists: [{
      name: "Sniper Arenas",
      description: "Open maps with long corridors",
      encodedValue: "eyJuYW1lIjoiU25pcGVyIEFyZW5hcyIsIm1hcHMiOlsiQXJlbmFfMDAiXX0=",
      mapNames: ["Arena_00"],
    }],
    weaponConfigurations: [{
      kind: "swapper",
      name: "Sniper Swaps",
      description: "Replaces automatics with bolt-actions",
      encodedValue: "U1dBUFBFUjpTTklQRVI=",
    }],
  }],
};

const multilingualProfanityCases = [
  { language: "en", text: "fuck" },
  { language: "fr", text: "connard" },
  { language: "es", text: "puta" },
  { language: "de", text: "scheiße" },
  { language: "ru", text: "сука" },
  { language: "zh", text: "这个预设他妈的真的很乱" },
  { language: "ar", text: "شرموطة" },
  { language: "pt", text: "caralho" },
  { language: "it", text: "stronzo" },
  { language: "hi", text: "चूतिया" },
  { language: "ja", text: "このプリセットはくそです" },
  { language: "ko", text: "이 프리셋은 씨발이다" },
] as const;

const cleanNonEnglishDescriptions = [
  { language: "fr", text: "Des cartes ouvertes avec des passages rapides, des combats variés et assez de place pour changer de stratégie." },
  { language: "es", text: "Mapas abiertos con rutas rápidas, combates variados y suficiente espacio para cambiar de estrategia." },
  { language: "de", text: "Offene Karten mit schnellen Wegen, abwechslungsreichen Kämpfen und genug Platz für neue Strategien." },
  { language: "ru", text: "Открытые карты с быстрыми маршрутами, разнообразными боями и местом для смены стратегии." },
  { language: "zh", text: "开放地图提供快速路线和多样化的战斗方式，也有足够空间让玩家随时改变策略和选择新的进攻方向。" },
  { language: "ar", text: "خرائط مفتوحة مع مسارات سريعة ومعارك متنوعة ومساحة كافية لتغيير الخطة أثناء اللعب." },
  { language: "pt", text: "Mapas abertos com caminhos rápidos, combates variados e espaço suficiente para mudar de estratégia." },
  { language: "it", text: "Mappe aperte con percorsi rapidi, combattimenti vari e abbastanza spazio per cambiare strategia." },
  { language: "hi", text: "खुले नक्शों में तेज रास्ते, अलग तरह की लड़ाइयाँ और खेल के दौरान योजना बदलने के लिए काफी जगह है।" },
  { language: "ja", text: "開けたマップには素早く移動できるルートと多様な戦いがあり、試合中に作戦を変えるための十分な空間もあります。" },
  { language: "ko", text: "열린 맵에는 빠르게 이동할 수 있는 길과 다양한 전투가 있으며, 경기 중 전략을 바꿀 수 있는 충분한 공간도 있습니다." },
] as const;

test("color tag stripping removes TMPro colors and formatting tags", () => {
  assert.equal(hasColorOrFormattingTags("<#FF0080><i>Styled Title</i></color>"), true);
  assert.equal(stripColorAndFormattingTags("<#FF0080><i>Styled Title</i></color>"), "Styled Title");
  assert.equal(stripColorAndFormattingTags("<#FFF>Clean<b>Name</b>"), "CleanName");
  assert.equal(stripColorAndFormattingTags("<u>Underline</u> <s>Strike</s> <smallcaps>Caps</smallcaps>"), "Underline Strike Caps");
  assert.equal(stripColorAndFormattingTags("Plain Name"), "Plain Name");
  assert.equal(hasColorOrFormattingTags("Plain Name"), false);
});

test("parseStraftatMarkup parses rich text formatting tags accurately", async () => {
  const { parseStraftatMarkup } = await import("../src/domain/straftat-markup");

  // Fast path plain text
  assert.deepEqual(parseStraftatMarkup("Simple Title"), [{ text: "Simple Title" }]);

  // Bold, italic, underline, strikethrough
  const formatted = parseStraftatMarkup("<b>Bold</b> <i>Italic</i> <u>Under</u> <s>Strike</s>");
  assert.equal(formatted.find(s => s.text === "Bold")?.bold, true);
  assert.equal(formatted.find(s => s.text === "Italic")?.italic, true);
  assert.equal(formatted.find(s => s.text === "Under")?.underline, true);
  assert.equal(formatted.find(s => s.text === "Strike")?.strikethrough, true);

  // Hex color and named color
  const colors = parseStraftatMarkup("<#FF00AA>Hex</color> <color=yellow>Yellow</color>");
  assert.equal(colors.find(s => s.text === "Hex")?.color, "#FF00AA");
  assert.equal(colors.find(s => s.text === "Yellow")?.color, "#FFFF00");

  // Smallcaps, uppercase, lowercase
  const casing = parseStraftatMarkup("<smallcaps>Small</smallcaps> <allcaps>Upper</allcaps> <lowercase>Lower</lowercase>");
  assert.equal(casing.find(s => s.text === "Small")?.smallcaps, true);
  assert.equal(casing.find(s => s.text === "Upper")?.allcaps, true);
  assert.equal(casing.find(s => s.text === "Lower")?.lowercase, true);

  // Mark / highlight
  const mark = parseStraftatMarkup("<mark=#FF8800>Highlighted</mark>");
  assert.equal(mark.find(s => s.text === "Highlighted")?.backgroundColor, "#FF8800");

  // Subscript / Superscript
  const script = parseStraftatMarkup("H<sub>2</sub>O 10<sup>2</sup>");
  assert.equal(script.find(s => s.text === "2")?.subscript, true);
  assert.equal(script.find(s => s.text === "2")?.superscript, undefined);

  // Noparse mode
  const noparse = parseStraftatMarkup("<noparse><b>Not Bold</b></noparse>");
  assert.equal(noparse.find(s => s.text.includes("Not Bold"))?.bold, false);
});

test("extractModeratableFields extracts all relevant text fields including colored text", () => {
  const coloredPreset: PresetRevisionContent = {
    ...sampleValidPreset,
    title: "<#FF0000>Red Alert</color>",
  };
  const fields = extractModeratableFields(coloredPreset);
  assert.equal(fields.length, 6); // title, desc, playlist.name, playlist.desc, swapper.name, swapper.desc
  assert.equal(fields.find((f) => f.path === "title")?.cleanText, "Red Alert");
  assert.equal(fields.find((f) => f.path === "title")?.hasColorCodes, true);
  assert.equal(fields.find((f) => f.path === "description")?.cleanText, sampleValidPreset.description);
});

test("Level 1 Limits catches invalid lengths and placeholder titles", () => {
  const fields = extractModeratableFields({
    ...sampleValidPreset,
    title: "H", // too short (< 2)
  });
  const res = checkLevel1Limits(fields);
  assert.equal(res.decision, "rejected");
  assert.equal(res.flags.some((f) => f.code === "title_too_short"), true);

  const placeholderFields = extractModeratableFields({
    ...sampleValidPreset,
    title: "Untitled name",
  });
  const placeholderRes = checkLevel1Limits(placeholderFields);
  assert.equal(placeholderRes.decision, "rejected");
  assert.equal(placeholderRes.flags.some((f) => f.code === "invalid_title"), true);

  // Clean text > 70 symbols
  const tooLongTitleFields = extractModeratableFields({
    ...sampleValidPreset,
    title: "<#FF0000>" + "X".repeat(71) + "</color>",
  });
  const tooLongTitleRes = checkLevel1Limits(tooLongTitleFields);
  assert.equal(tooLongTitleRes.decision, "rejected");
  assert.equal(tooLongTitleRes.flags.some((f) => f.code === "title_too_long"), true);

  // Raw text > 500 characters
  const tooLongRawFields = extractModeratableFields({
    ...sampleValidPreset,
    title: "<#123456>" + "X".repeat(50) + "</color>".repeat(60),
  });
  const tooLongRawRes = checkLevel1Limits(tooLongRawFields);
  assert.equal(tooLongRawRes.decision, "rejected");
  assert.equal(tooLongRawRes.flags.some((f) => f.code === "title_raw_too_long"), true);

  // Description > 10 lines
  const tooManyLinesFields = extractModeratableFields({
    ...sampleValidPreset,
    description: Array.from({ length: 11 }, (_, i) => `Line ${i + 1}`).join("\r\n"),
  });
  const tooManyLinesRes = checkLevel1Limits(tooManyLinesFields);
  assert.equal(tooManyLinesRes.decision, "rejected");
  assert.equal(tooManyLinesRes.flags.some((f) => f.code === "description_too_many_lines"), true);

  // Description consecutive empty lines
  const consecutiveEmptyFields = extractModeratableFields({
    ...sampleValidPreset,
    description: "Intro line\n\n\nBody paragraph",
  });
  const consecutiveEmptyRes = checkLevel1Limits(consecutiveEmptyFields);
  assert.equal(consecutiveEmptyRes.decision, "rejected");
  assert.equal(consecutiveEmptyRes.flags.some((f) => f.code === "description_consecutive_empty_lines"), true);
});

test("Level 2 Hard Reject catches 100% prohibited hate speech and symbols", () => {
  const hatePreset = extractModeratableFields({
    ...sampleValidPreset,
    title: "Join the Nazi party",
  });
  const res = checkLevel2HardReject(hatePreset);
  assert.equal(res.decision, "rejected");
  assert.equal(res.flags.some((f) => f.code === "hard_rejected_term"), true);

  const symbolPreset = extractModeratableFields({
    ...sampleValidPreset,
    title: "卍 symbol here",
  });
  const symbolRes = checkLevel2HardReject(symbolPreset);
  assert.equal(symbolRes.decision, "rejected");

  const cleanRes = checkLevel2HardReject(extractModeratableFields(sampleValidPreset));
  assert.equal(cleanRes.decision, "approved");
});

test("Level 3 Computery Profanity Filter detects obfuscated profanity and respects allow terms", () => {
  // Direct matches
  assert.equal(scanTextForProfanity("what a bullshit move").length > 0, true);

  // Leet speak & punctuation obfuscation
  assert.equal(scanTextForProfanity("what a b!tch").length > 0, true);
  assert.equal(scanTextForProfanity("f.u.c.k this").length > 0, true);
  assert.equal(scanTextForProfanity("a$$hole").length > 0, true);

  // Sequence map (/\/\ -> m, |3 -> b)
  assert.equal(scanTextForProfanity("du/\\/\\bshit").length > 0, true);

  // Repeated character collapse
  assert.equal(scanTextForProfanity("fuuuuuck").length > 0, true);

  // Allow terms exemption
  assert.equal(scanTextForProfanity("as per rules").length, 0); // "as" allowed, doesn't flag "ass"
  assert.equal(scanTextForProfanity("look into the a hole").length, 0); // "a hole" allowed

  // Preset check
  const profanityFields = extractModeratableFields({
    ...sampleValidPreset,
    description: "This is a b.i.t.c.h of a map rotation for everyone.",
  });
  const res = checkLevel3Computery(profanityFields);
  assert.equal(res.decision, "review_required");
  assert.equal(res.flags.length > 0, true);
});

test("Level 4 Quality & Libraries checks mashing, caps, and language detection", () => {
  const mashingFields = extractModeratableFields({
    ...sampleValidPreset,
    description: "aaaaaaaaaaahhhhhh",
  });
  const mashingRes = checkLevel4QualityAndLibraries(mashingFields);
  assert.equal(mashingRes.decision, "review_required");
  assert.equal(mashingRes.flags.some((f) => f.code === "low_quality_mashing"), true);

  const capsFields = extractModeratableFields({
    ...sampleValidPreset,
    description: "VERY LOUD DESCRIPTION TEXT HERE",
  });
  const capsRes = checkLevel4QualityAndLibraries(capsFields);
  assert.equal(capsRes.decision, "review_required");
  assert.equal(capsRes.flags.some((f) => f.code === "low_quality_caps"), true);

  const validRes = checkLevel4QualityAndLibraries(extractModeratableFields(sampleValidPreset));
  assert.equal(validRes.decision, "approved");
});

test("Level 4 profanity screening covers every configured language", () => {
  assert.deepEqual(
    [...new Set(multilingualProfanityCases.map(({ language }) => language))].sort(),
    [...PROFANITY_LANGUAGE_CODES].sort(),
  );

  for (const { language, text } of multilingualProfanityCases) {
    const fields = extractModeratableFields({
      ...sampleValidPreset,
      description: `A normal preset description containing ${text} for the moderation check.`,
    });
    const result = checkLevel4QualityAndLibraries(fields);

    assert.equal(
      result.flags.some((flag) => flag.field === "description" && (
        flag.code === "profanity_library_match" || flag.code === "non_english_profanity_dictionary_match"
      )),
      true,
      `${language} profanity was not detected: ${text}`,
    );
    assert.equal(
      result.decision,
      language === "en" ? "review_required" : "rejected",
      `${language} profanity produced the wrong moderation decision: ${text}`,
    );
  }
});

test("Cyrillic and transliterated Russian profanity is rejected by server moderation", async () => {
  const cases = [
    "пидор долбоеб пидарас ебаный в рот",
    "pidor",
  ];

  for (const text of cases) {
    const content: PresetRevisionContent = {
      ...sampleValidPreset,
      description: `A complete preset description containing ${text} for the server moderation check.`,
    };

    assert.equal(runClientModeration(content).decision, "approved");

    const serverResult = await runServerModeration(content);
    assert.equal(serverResult.decision, "rejected", `Server moderation did not reject: ${text}`);
    assert.equal(
      serverResult.flags.some((flag) => flag.code === "non_english_profanity_dictionary_match"),
      true,
      `Server moderation did not report its dictionary match: ${text}`,
    );
  }
});

test("non-English profanity is rejected by the complete server moderation pipeline", async () => {
  for (const { language, text } of multilingualProfanityCases) {
    const result = await runServerModeration({
      ...sampleValidPreset,
      description: `A complete preset description containing ${text} for the server moderation check.`,
    });

    assert.equal(
      result.decision,
      language === "en" ? "review_required" : "rejected",
      `${language} profanity produced the wrong server decision: ${text}`,
    );
  }
});

test("clean text in every supported non-English language passes server moderation", async () => {
  assert.deepEqual(
    [...new Set(cleanNonEnglishDescriptions.map(({ language }) => language))].sort(),
    PROFANITY_LANGUAGE_CODES.filter((language) => language !== "en").sort(),
  );

  for (const { language, text } of cleanNonEnglishDescriptions) {
    const result = await runServerModeration({
      ...sampleValidPreset,
      description: text,
    });

    assert.equal(result.decision, "approved", `${language} clean text was not approved`);
  }
});

test("non-English profanity still rejects text that also contains English profanity", async () => {
  const result = await runServerModeration({
    ...sampleValidPreset,
    description: "A complete preset description containing fuck and сука for the server moderation check.",
  });

  assert.equal(result.decision, "rejected");
  assert.equal(result.flags.some((flag) => flag.code === "non_english_profanity_dictionary_match"), true);
});

test("non-English profanity in nested preset fields is rejected with its field path", async () => {
  const result = await runServerModeration({
    ...sampleValidPreset,
    versions: [{
      ...sampleValidPreset.versions[0],
      mapPlaylists: [{
        ...sampleValidPreset.versions[0].mapPlaylists[0],
        name: "сука maps",
      }],
    }],
  });

  assert.equal(result.decision, "rejected");
  assert.equal(
    result.flags.some((flag) => flag.code === "non_english_profanity_dictionary_match" && flag.field === "versions.0.mapPlaylists.0.name"),
    true,
  );
});

test("runClientModeration and runServerModeration orchestrate tiers correctly", async () => {
  // Clean preset passes both client and server
  const clientClean = runClientModeration(sampleValidPreset);
  assert.equal(clientClean.decision, "approved");

  const serverClean = await runServerModeration(sampleValidPreset);
  assert.equal(serverClean.decision, "approved");

  // Prohibited vocabulary is rejected by both client and server early
  const hardRejectPreset: PresetRevisionContent = {
    ...sampleValidPreset,
    title: "kys now",
  };
  const clientReject = runClientModeration(hardRejectPreset);
  assert.equal(clientReject.decision, "rejected");

  const serverReject = await runServerModeration(hardRejectPreset);
  assert.equal(serverReject.decision, "rejected");

  // Moderate profanity passes client (so client doesn't need heavy dictionary), but triggers review on server
  const softProfanityPreset: PresetRevisionContent = {
    ...sampleValidPreset,
    title: "Holy Shit Map",
  };
  const clientSoft = runClientModeration(softProfanityPreset);
  assert.equal(clientSoft.decision, "approved");

  const serverSoft = await runServerModeration(softProfanityPreset);
  assert.equal(serverSoft.decision, "review_required");
});

test("getChangedModeratableFields detects exact text changes and ignores unchanged fields across revisions", () => {
  const publishedPreset: PresetRevisionContent = sampleValidPreset;

  // 1. Initial publication (no previous) -> all fields returned
  assert.equal(getChangedModeratableFields(null, publishedPreset).length, 6);

  // 2. Only gameplay/structural changes (version label bumped, maps added, weapon weights adjusted)
  const gameplayOnlyRevision: PresetRevisionContent = {
    ...publishedPreset,
    versions: [{
      label: "v1.1.0", // bumped
      mapPlaylists: [{
        ...publishedPreset.versions[0].mapPlaylists[0],
        mapNames: ["Arena_00", "Arena_01", "Arena_02"], // map count changed
      }],
      weaponConfigurations: [{
        kind: "swapper",
        name: "Sniper Swaps",
        description: "Replaces automatics with bolt-actions",
        encodedValue: "U1dBUFBFUjpORVdfUlVMRVM=", // rules changed
      }],
    }],
  };
  const changedGameplay = getChangedModeratableFields(publishedPreset, gameplayOnlyRevision);
  assert.equal(changedGameplay.length, 0);

  // 3. New version added with same playlist/swapper names copied over
  const multiVersionRevision: PresetRevisionContent = {
    ...publishedPreset,
    versions: [
      publishedPreset.versions[0],
      {
        label: "v1.1.0",
        mapPlaylists: [publishedPreset.versions[0].mapPlaylists[0]],
        weaponConfigurations: [publishedPreset.versions[0].weaponConfigurations[0]],
      },
    ],
  };
  const changedMultiVersion = getChangedModeratableFields(publishedPreset, multiVersionRevision);
  assert.equal(changedMultiVersion.length, 0);

  // 4. Description modified
  const descChangedRevision: PresetRevisionContent = {
    ...publishedPreset,
    description: "An updated and highly polished description for competitive play.",
  };
  const changedDesc = getChangedModeratableFields(publishedPreset, descChangedRevision);
  assert.equal(changedDesc.length, 1);
  assert.equal(changedDesc[0].path, "description");
  assert.equal(changedDesc[0].rawText, descChangedRevision.description);

  // 5. Playlist name modified
  const playlistNameChanged: PresetRevisionContent = {
    ...publishedPreset,
    versions: [{
      ...publishedPreset.versions[0],
      mapPlaylists: [{
        ...publishedPreset.versions[0].mapPlaylists[0],
        name: "Long Sightline Arenas",
      }],
    }],
  };
  const changedPlaylist = getChangedModeratableFields(publishedPreset, playlistNameChanged);
  assert.equal(changedPlaylist.length, 1);
  assert.equal(changedPlaylist[0].path, "versions.0.mapPlaylists.0.name");
});

test("runServerModeration with previousContent auto-approves trusted revisions without review unless suspicious", async () => {
  const publishedPreset: PresetRevisionContent = sampleValidPreset;

  // 1. Revision with only version/map changes auto-approves
  const revision1: PresetRevisionContent = {
    ...publishedPreset,
    versions: [{
      label: "v1.1.0",
      mapPlaylists: [{
        ...publishedPreset.versions[0].mapPlaylists[0],
        mapNames: ["Arena_00", "Arena_01"],
      }],
      weaponConfigurations: publishedPreset.versions[0].weaponConfigurations,
    }],
  };
  const result1 = await runServerModeration(revision1, { previousContent: publishedPreset });
  assert.equal(result1.decision, "approved");

  // 2. Revision with clean new description auto-approves
  const revisionClean: PresetRevisionContent = {
    ...publishedPreset,
    description: "New updated clean description with sharp sightlines and tactical gameplay.",
  };
  const resultClean = await runServerModeration(revisionClean, { previousContent: publishedPreset });
  assert.equal(resultClean.decision, "approved");

  // 3. Revision with profanity/mashing in changed text requires review
  const revisionSus: PresetRevisionContent = {
    ...publishedPreset,
    description: "asdfghjklqwerty zxcvbnmasdfghjkl qwertyuiop",
  };
  const resultSus = await runServerModeration(revisionSus, { previousContent: publishedPreset });
  assert.equal(resultSus.decision, "review_required");

  // 4. Hard reject in any field (even if unchanged) is still rejected immediately
  const revisionHardReject: PresetRevisionContent = {
    ...publishedPreset,
    title: "kys now",
  };
  const resultHardReject = await runServerModeration(revisionHardReject, { previousContent: publishedPreset });
  assert.equal(resultHardReject.decision, "rejected");

  // 5. Non-English profanity in changed text is rejected instead of queued for review
  const revisionForeignProfanity: PresetRevisionContent = {
    ...publishedPreset,
    description: "A changed preset description containing сука that must be rejected automatically.",
  };
  const resultForeignProfanity = await runServerModeration(revisionForeignProfanity, { previousContent: publishedPreset });
  assert.equal(resultForeignProfanity.decision, "rejected");
  assert.equal(resultForeignProfanity.flags.some((flag) => flag.code === "non_english_profanity_dictionary_match"), true);
});

test("link detection prohibits direct, obfuscated, and colored text links in all fields", () => {
  // 1. Direct URLs & Protocols
  assert.equal(detectLinks("Check out https://example.com for info").hasLink, true);
  assert.equal(detectLinks("Visit http://straftat.org/maps").hasLink, true);
  assert.equal(detectLinks("Go to www.somewebsite.net").hasLink, true);
  assert.equal(detectLinks("Connect to ws://myserver.io").hasLink, true);
  assert.equal(detectLinks("Check 192.168.1.50:8080").hasLink, true);

  // 2. Platform shortcuts & Social links
  assert.equal(detectLinks("Join discord.gg/straftat").hasLink, true);
  assert.equal(detectLinks("Add me on t.me/mychannel").hasLink, true);
  assert.equal(detectLinks("Watch youtu.be/dQw4w9WgXcQ").hasLink, true);
  assert.equal(detectLinks("Stream on twitch.tv/gamer").hasLink, true);
  assert.equal(detectLinks("Link bit.ly/3xyz").hasLink, true);

  // 3. Obfuscated Dot / Slash Text Hacks
  assert.equal(detectLinks("somewebsite [dot] com").hasLink, true);
  assert.equal(detectLinks("somewebsite(dot)com").hasLink, true);
  assert.equal(detectLinks("somewebsite{dot}com").hasLink, true);
  assert.equal(detectLinks("somewebsite<dot>com").hasLink, true);
  assert.equal(detectLinks("somewebsite dot com").hasLink, true);
  assert.equal(detectLinks("somewebsite[.]com").hasLink, true);
  assert.equal(detectLinks("somewebsite .com").hasLink, true);
  assert.equal(detectLinks("somewebsite . com").hasLink, true);
  assert.equal(detectLinks("somewebsite com / invite").hasLink, true);
  assert.equal(detectLinks("youtube com").hasLink, true);
  assert.equal(detectLinks("somewebsite net").hasLink, true);
  assert.equal(detectLinks("somewebsite ru").hasLink, true);
  assert.equal(detectLinks("somewebsite io").hasLink, true);
  assert.equal(detectLinks("discord gg / myinvite").hasLink, true);
  assert.equal(detectLinks("t me / channel").hasLink, true);

  // 4. Colored / TMPro Text Hacks
  assert.equal(detectLinks("<#FF0000>https://<#00FF00>example.com").hasLink, true);
  assert.equal(detectLinks("<#FF0000>somewebsite<#00FF00>.com").hasLink, true);
  assert.equal(detectLinks("<b>somewebsite</b> [dot] <i>com</i>").hasLink, true);
  assert.equal(detectLinks("<#FFF>somewebsite<#000> .com").hasLink, true);
  assert.equal(detectLinks("<#FFF>somewebsite<#000> net").hasLink, true);

  // 5. Valid text that must NOT trigger false positives
  assert.equal(detectLinks("A tactical arena preset with 10 weapons. Come try it!").hasLink, false);
  assert.equal(detectLinks("STRAFTAT 1.4.8 version v1.0.0").hasLink, false);
  assert.equal(detectLinks("e.g. shotgun or rocket launcher").hasLink, false);
  assert.equal(detectLinks("Damage multiplier is 1.5 with 100.0 percent accuracy").hasLink, false);
});

test("client and server moderation reject presets containing links in any field", async () => {
  const presetWithLinkInTitle: PresetRevisionContent = {
    ...sampleValidPreset,
    title: "Play on straftat.com",
  };
  const clientRes = runClientModeration(presetWithLinkInTitle);
  assert.equal(clientRes.decision, "rejected");
  assert.equal(clientRes.flags.some((f) => f.code === "links_prohibited" && f.field === "title"), true);

  const presetWithLinkInDesc: PresetRevisionContent = {
    ...sampleValidPreset,
    description: "Join our community at <#FF0000>discord<#00FF00> gg / invite for tournaments.",
  };
  const serverRes = await runServerModeration(presetWithLinkInDesc);
  assert.equal(serverRes.decision, "rejected");
  assert.equal(serverRes.flags.some((f) => f.code === "links_prohibited" && f.field === "description"), true);
});
