import { ABILITIES, type Ability, incrementTotal } from "../rules/abilities";
import { parseDice } from "../rules/dice";
import { isLegalAsi, isLegalPointBuy, pointsSpent } from "../rules/pointbuy";
import { SRD_CLASSES } from "../srd/classes";
import { SRD_ARMOR, SRD_WEAPONS } from "../srd/equipment";
import { SRD_SPELLS } from "../srd/spells";
import { indexWorld } from "./index-world";
import type { World, WorldIssue } from "./types";

/**
 * Cross-reference and design-rule checks that a schema alone cannot express.
 * Errors block loading; warnings are printed by `pnpm world:validate`.
 */
export function validateWorld(world: World): WorldIssue[] {
  const issues: WorldIssue[] = [];
  const idx = indexWorld(world);
  const err = (file: string, path: string, message: string) =>
    issues.push({ file, path, message, severity: "error" });
  const warn = (file: string, path: string, message: string) =>
    issues.push({ file, path, message, severity: "warning" });

  // Duplicate ids within each collection.
  const dupes = (file: string, ids: string[]) => {
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) err(file, id, `duplicate id "${id}"`);
      seen.add(id);
    }
  };
  dupes(
    "classes.yaml",
    world.classes.map((c) => c.id),
  );
  dupes(
    "backgrounds.yaml",
    world.backgrounds.map((c) => c.id),
  );
  dupes(
    "species.yaml",
    world.species.map((c) => c.id),
  );
  dupes(
    "creatures.yaml",
    world.creatures.map((c) => c.id),
  );
  dupes(
    "shortcuts.yaml",
    world.shortcuts.map((c) => c.id),
  );
  dupes(
    "regions/",
    world.regions.map((c) => c.id),
  );
  dupes(
    "factions/",
    world.factions.map((c) => c.id),
  );
  dupes(
    "providence/detours.yaml",
    world.detours.map((c) => c.id),
  );
  dupes("npcs/archetypes.yaml", [
    ...world.npcs.archetypes.map((a) => a.id),
    ...world.npcs.named.map((n) => n.id),
  ]);
  dupes("items.yaml", [
    ...world.items.weapons.map((x) => x.id),
    ...world.items.armor.map((x) => x.id),
    ...world.items.gear.map((x) => x.id),
    ...world.items.keepsakes.map((x) => x.id),
    ...world.items.wondrous.map((x) => x.id),
    ...world.items.consumables.map((x) => x.id),
  ]);
  dupes(
    "arc/",
    idx.beatOrder.map((b) => b.beat.id),
  );
  dupes(
    "regions/ (pois)",
    world.regions.flatMap((r) => r.pois.map((p) => p.id)),
  );

  // world.yaml
  if (!idx.regions.has(world.meta.startRegion))
    err("world.yaml", "startRegion", `unknown region "${world.meta.startRegion}"`);
  if (world.meta.startingLevel > world.meta.maxLevel)
    err("world.yaml", "startingLevel", "startingLevel exceeds maxLevel");

  // Paths: both roads must exist.
  for (const id of ["long-road", "quick-way"] as const) {
    if (!world.paths.some((p) => p.id === id)) err("paths.yaml", id, `missing path "${id}"`);
  }

  // Items reference real SRD bases.
  for (const w of world.items.weapons)
    if (!SRD_WEAPONS[w.base]) err("items.yaml", `weapons.${w.id}`, `unknown SRD weapon "${w.base}"`);
  for (const a of world.items.armor)
    if (!SRD_ARMOR[a.base]) err("items.yaml", `armor.${a.id}`, `unknown SRD armor "${a.base}"`);
  for (const table of world.items.lootTables) {
    if (table.gold) checkDice("items.yaml", `lootTables.${table.id}.gold`, table.gold, err);
    for (const entry of table.entries) {
      if (!idx.items.has(entry.item))
        err("items.yaml", `lootTables.${table.id}`, `unknown item "${entry.item}"`);
    }
  }

  // Classes.
  for (const cls of world.classes) {
    const srd = SRD_CLASSES[cls.srdClass];
    for (const weaponId of cls.startingKit.weapons) {
      const item = idx.items.get(weaponId);
      if (item?.kind !== "weapon")
        err("classes.yaml", `${cls.id}.startingKit`, `"${weaponId}" is not a weapon item`);
    }
    if (cls.startingKit.armor) {
      const item = world.items.armor.find((a) => a.id === cls.startingKit.armor);
      if (!item)
        err("classes.yaml", `${cls.id}.startingKit`, `"${cls.startingKit.armor}" is not an armor item`);
      else {
        const base = SRD_ARMOR[item.base];
        if (base && !srd.armorTraining.includes(base.category)) {
          err(
            "classes.yaml",
            `${cls.id}.startingKit`,
            `${srd.name} is not trained in ${base.category} armor`,
          );
        }
      }
    }
    if (cls.startingKit.shield && !srd.armorTraining.includes("shield")) {
      err("classes.yaml", `${cls.id}.startingKit`, `${srd.name} is not trained with shields`);
    }
    for (const gearId of cls.startingKit.gear) {
      if (!idx.items.has(gearId)) err("classes.yaml", `${cls.id}.startingKit`, `unknown item "${gearId}"`);
    }
    for (const spellId of cls.suggestedSpells) {
      const spell = SRD_SPELLS[spellId];
      if (!spell) err("classes.yaml", `${cls.id}.suggestedSpells`, `unknown spell "${spellId}"`);
      else if (!spell.classes.includes(cls.srdClass)) {
        err("classes.yaml", `${cls.id}.suggestedSpells`, `${spell.name} is not on the ${srd.name} list`);
      }
    }
    if (srd.skillChoices.from !== "any") {
      for (const skill of cls.suggestedSkills) {
        if (!srd.skillChoices.from.includes(skill as never)) {
          err("classes.yaml", `${cls.id}.suggestedSkills`, `"${skill}" is not a ${srd.name} skill choice`);
        }
      }
    }
  }

  // Backgrounds.
  for (const bg of world.backgrounds) {
    if (new Set(bg.abilities).size !== 3)
      err("backgrounds.yaml", bg.id, "background abilities must be three different abilities");
    if (bg.skills[0] === bg.skills[1]) err("backgrounds.yaml", bg.id, "background skills must differ");
    for (const k of bg.keepsakeSuggestions) {
      if (!world.items.keepsakes.some((x) => x.id === k))
        err("backgrounds.yaml", bg.id, `unknown keepsake "${k}"`);
    }
  }

  // Guided options.
  const classIds = new Set(world.classes.map((c) => c.id));
  for (const up of world.guided.upbringings) {
    if (!isLegalPointBuy(up.scores))
      err("guided-options.yaml", `upbringings.${up.id}`, "scores are not a legal 27-point buy");
    if (isLegalPointBuy(up.scores) && pointsSpent(up.scores) < 27) {
      warn("guided-options.yaml", `upbringings.${up.id}`, "spends fewer than 27 points");
    }
    for (const c of up.classAffinity) {
      if (!classIds.has(c)) err("guided-options.yaml", `upbringings.${up.id}`, `unknown class "${c}"`);
    }
  }
  for (const cls of world.classes) {
    if (!world.guided.upbringings.some((u) => u.classAffinity.includes(cls.id))) {
      err("guided-options.yaml", "upbringings", `no upbringing suits class "${cls.id}"`);
    }
  }
  for (const opt of world.guided.asiOptions) {
    if (!isLegalAsi(opt.increments)) {
      err(
        "guided-options.yaml",
        `asiOptions.${opt.id}`,
        `increments total ${incrementTotal(opt.increments)}; must be +2 or +1/+1`,
      );
    }
  }
  const asiCovers = new Set<Ability>();
  for (const opt of world.guided.asiOptions)
    for (const a of ABILITIES) if (opt.increments[a]) asiCovers.add(a);
  for (const a of ABILITIES)
    if (!asiCovers.has(a)) err("guided-options.yaml", "asiOptions", `no option raises ${a}`);

  // Creatures.
  for (const c of world.creatures) {
    checkDice("creatures.yaml", `${c.id}.hp`, c.hp, err);
    for (const atk of c.attacks) checkDice("creatures.yaml", `${c.id}.attacks`, atk.damage, err);
  }

  // Factions and NPCs.
  const npcIds = new Set(world.npcs.named.map((n) => n.id));
  for (const f of world.factions) {
    if (f.leader && !npcIds.has(f.leader))
      err(`factions/${f.id}.yaml`, "leader", `unknown named npc "${f.leader}"`);
  }
  for (const a of world.npcs.archetypes) {
    if (a.creature && !idx.creatures.has(a.creature))
      err("npcs/archetypes.yaml", a.id, `unknown creature "${a.creature}"`);
    if (a.faction && !idx.factions.has(a.faction))
      err("npcs/archetypes.yaml", a.id, `unknown faction "${a.faction}"`);
  }
  for (const n of world.npcs.named) {
    if (!idx.archetypes.has(n.archetype))
      err("npcs/archetypes.yaml", n.id, `unknown archetype "${n.archetype}"`);
    if (!idx.regions.has(n.region)) err("npcs/archetypes.yaml", n.id, `unknown region "${n.region}"`);
    if (n.faction && !idx.factions.has(n.faction))
      err("npcs/archetypes.yaml", n.id, `unknown faction "${n.faction}"`);
    if (n.creature && !idx.creatures.has(n.creature))
      err("npcs/archetypes.yaml", n.id, `unknown creature "${n.creature}"`);
  }

  // Regions: edges are symmetric and point at real regions.
  for (const r of world.regions) {
    const file = `regions/${r.id}.yaml`;
    if (r.levelBand[0] > r.levelBand[1]) err(file, "levelBand", "levelBand min exceeds max");
    for (const e of r.edges) {
      const other = idx.regions.get(e.to);
      if (!other) {
        err(file, "edges", `unknown region "${e.to}"`);
        continue;
      }
      const back = other.edges.find((b) => b.to === r.id);
      if (!back) err(file, "edges", `edge to "${e.to}" has no matching edge back`);
      else if (back.travelDays !== e.travelDays || back.road !== e.road) {
        err(file, "edges", `edge to "${e.to}" disagrees with its reverse edge`);
      }
    }
    for (const enc of r.encounters.table) {
      if (!idx.creatures.has(enc.creature)) err(file, "encounters", `unknown creature "${enc.creature}"`);
      if (enc.count[0] > enc.count[1]) err(file, "encounters", "count min exceeds max");
    }
    if (r.lootTable && !world.items.lootTables.some((t) => t.id === r.lootTable)) {
      err(file, "lootTable", `unknown loot table "${r.lootTable}"`);
    }
    const [cx, cy] = r.centroid;
    if (cx < 0 || cy < 0 || cx > world.map.width || cy > world.map.height)
      err(file, "centroid", "centroid is off the map");
  }
  // Every region is reachable from the start.
  const reachable = new Set<string>([world.meta.startRegion]);
  const queue = [world.meta.startRegion];
  while (queue.length > 0) {
    const id = queue.shift() as string;
    for (const e of idx.regions.get(id)?.edges ?? []) {
      if (!reachable.has(e.to)) {
        reachable.add(e.to);
        queue.push(e.to);
      }
    }
  }
  for (const r of world.regions)
    if (!reachable.has(r.id)) err(`regions/${r.id}.yaml`, "", "region cannot be reached from the start");

  // Payoff sockets: each type used anywhere must be described.
  const socketTypes = new Set(world.payoffs.sockets.map((s) => s.type));

  // Shortcuts.
  for (const s of world.shortcuts) {
    const ref = s.offeredBy;
    const exists =
      ref.kind === "npc"
        ? npcIds.has(ref.id) || idx.archetypes.has(ref.id)
        : ref.kind === "faction"
          ? idx.factions.has(ref.id)
          : idx.beats.has(ref.id);
    if (!exists) err("shortcuts.yaml", s.id, `offeredBy ${ref.kind} "${ref.id}" does not exist`);
    if (s.benefit.kind === "item" && !idx.items.has(s.benefit.item))
      err("shortcuts.yaml", s.id, `unknown item "${s.benefit.item}"`);
    if (s.snare.effect === "withhold_socket" && !s.snare.socket) {
      err("shortcuts.yaml", s.id, "withhold_socket snares must name the socket they withhold");
    }
    if (s.snare.socket && !socketTypes.has(s.snare.socket))
      err("shortcuts.yaml", s.id, `socket "${s.snare.socket}" is not described in payoffs.yaml`);
    if (s.snare.faction && !idx.factions.has(s.snare.faction))
      err("shortcuts.yaml", s.id, `unknown faction "${s.snare.faction}"`);
  }

  // Arc.
  const beatIds = new Set(idx.beatOrder.map((b) => b.beat.id));
  for (const ref of idx.beatOrder) {
    const { beat, act } = ref;
    const file = `arc/${act.id}.yaml`;
    const where = `${ref.chapter.id}.${beat.id}`;
    if (!idx.regions.has(beat.region)) err(file, where, `unknown region "${beat.region}"`);
    if (beat.poi) {
      const poi = idx.pois.get(beat.poi);
      if (!poi) err(file, where, `unknown poi "${beat.poi}"`);
      else if (poi.regionId !== beat.region)
        err(file, where, `poi "${beat.poi}" is not in region "${beat.region}"`);
    }
    for (const req of beat.requires) {
      const target = idx.beats.get(req);
      if (!target) err(file, where, `requires unknown beat "${req}"`);
      else if (target.order >= ref.order)
        err(file, where, `requires "${req}", which comes later in the story`);
    }
    for (const sid of beat.offersShortcuts)
      if (!idx.shortcuts.has(sid)) err(file, where, `unknown shortcut "${sid}"`);
    for (const nid of beat.introduces)
      if (!npcIds.has(nid)) err(file, where, `introduces unknown npc "${nid}"`);
    for (const s of beat.sockets)
      if (!socketTypes.has(s)) err(file, where, `socket "${s}" is not described in payoffs.yaml`);
    if (beat.decisive !== Boolean(beat.crux))
      err(file, where, "decisive beats need a crux, and only decisive beats may have one");
    if (beat.crux) {
      const crux = beat.crux;
      if (crux.onFailForward.beat && !beatIds.has(crux.onFailForward.beat)) {
        err(file, `${where}.crux`, `onFailForward beat "${crux.onFailForward.beat}" does not exist`);
      }
      if (crux.clock) {
        const fac = idx.factions.get(crux.clock.faction);
        if (!fac) err(file, `${where}.crux`, `unknown faction "${crux.clock.faction}"`);
        else if (!fac.clocks.some((c) => c.id === crux.clock?.clock))
          err(file, `${where}.crux`, `unknown clock "${crux.clock.clock}"`);
      }
      for (const socket of crux.sockets) {
        const desc = world.payoffs.sockets.find((s) => s.type === socket.type);
        if (!desc) err(file, `${where}.crux`, `socket "${socket.type}" is not described in payoffs.yaml`);
        if (socket.faction && !idx.factions.has(socket.faction))
          err(file, `${where}.crux`, `unknown faction "${socket.faction}"`);
      }
      if (beat.kind !== "crux") err(file, where, 'beats with a crux must have kind "crux"');
    }
  }
  for (const act of world.acts) {
    if (!act.chapters.some((c) => c.beats.some((b) => b.decisive)))
      err(`arc/${act.id}.yaml`, "", "each act needs one decisive beat");
  }
  const finalAct = [...world.acts].sort((a, b) => b.number - a.number)[0];
  const finalCrux = finalAct?.chapters.flatMap((c) => c.beats).findLast((b) => b.decisive);
  if (finalCrux && !finalCrux.crux?.sockets.some((s) => s.accepts.includes("mercy"))) {
    warn(`arc/${finalAct?.id}.yaml`, finalCrux.id, "the final crux has no socket that mercy can fill");
  }

  // Detours must serve a socket that some beat actually needs.
  const neededSockets = new Set(
    idx.beatOrder.flatMap((b) => [...b.beat.sockets, ...(b.beat.crux?.sockets.map((s) => s.type) ?? [])]),
  );
  for (const d of world.detours) {
    if (!d.serves.some((s) => neededSockets.has(s)))
      err("providence/detours.yaml", d.id, "serves no socket used by any beat");
    if (d.introduces.archetype && !idx.archetypes.has(d.introduces.archetype)) {
      err("providence/detours.yaml", d.id, `unknown archetype "${d.introduces.archetype}"`);
    }
    for (const s of d.serves)
      if (!socketTypes.has(s))
        err("providence/detours.yaml", d.id, `socket "${s}" is not described in payoffs.yaml`);
  }

  // Banned-word lint over all authored text.
  issues.push(...lintBannedTerms(world));
  return issues;
}

function checkDice(file: string, path: string, dice: string, err: (f: string, p: string, m: string) => void) {
  try {
    parseDice(dice);
  } catch (e) {
    err(file, path, `bad dice "${dice}": ${(e as Error).message}`);
  }
}

/** Collects every string in the world except the content rules themselves. */
function authoredStrings(world: World): Array<{ file: string; text: string }> {
  const out: Array<{ file: string; text: string }> = [];
  const walk = (file: string, value: unknown) => {
    if (typeof value === "string") out.push({ file, text: value });
    else if (Array.isArray(value)) for (const v of value) walk(file, v);
    else if (value && typeof value === "object") for (const v of Object.values(value)) walk(file, v);
  };
  const { content: _content, ...rest } = world;
  for (const [key, value] of Object.entries(rest)) walk(key, value);
  return out;
}

export function lintBannedTerms(world: World): WorldIssue[] {
  const issues: WorldIssue[] = [];
  const patterns = world.content.bannedTerms.map((t) => ({
    term: t,
    re: new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i"),
  }));
  for (const { file, text } of authoredStrings(world)) {
    for (const { term, re } of patterns) {
      if (re.test(text)) {
        issues.push({
          file,
          path: text.slice(0, 60),
          message: `uses banned term "${term}"`,
          severity: "error",
        });
      }
    }
  }
  return issues;
}
