/* ========================== Globals & Utilities ========================== */
/** When false: engravings stay in engravings.json + window.__RAW_ENVS but are omitted from dropdown, rolls, and Compare Cards. Set true to restore. */
const INCLUDE_ENGRAVINGS_IN_UI = false;
let ENCHANTS = [], AUGMENTS = [], AUGMENTS_BY_NAME = {};
let selectedSlots = 1, currentEnchantments = [], totalDustUsed = 0;
const BASE_DUST = { 1: 50, 2: 65, 3: 80, 4: 100 };
/** Default trials for Compare Cards Monte Carlo runs (Enchant Simulation uses path-based sizing). */
const MONTE_CARLO_TRIALS = 50000;
const MONTE_CARLO_CHUNK_SIZE = 1000;
/** Default / bounds for path batch size (user-editable in the path tool UI). */
const PATH_SIM_BATCH_TRIALS_DEFAULT = 10000;
const PATH_SIM_BATCH_TRIALS_MIN = 1;
const PATH_SIM_BATCH_TRIALS_MAX = 1_000_000;
/** Quick Estimate uses this × "Paths per run" for one-roll Monte Carlo sample size. */
const QUICK_ESTIMATE_PATH_MULTIPLIER = 10;
let probabilityRunToken = 0;
let simulatorInitPromise = null;
let simulatorDidInit = false;

/* ========================== Awakening Maps ========================== */
let AWAKENING_MAP = {
  "Ancient's Blessing": ["Tomb rings"],
  "Ancient Artifacts": ["Snakeskin Armor"],
  "Apitoxin": ["Doku No Ken"],
  "Artificial Core": ["Staff of Extreme Prejudice"],
  "Bone Claws": ["Bone Dagger"],
  "Buzzing Bullets": ["Queen's Stinger"],
  "Crystalline Channel": ["Staff of the Crystal Serpent"],
  "Crystal Shards": ["Crystal Wand"],
  "Draconic Gaze": ["Snake Eye Ring"],
  "Drake Warden": ["LoD Armors"],
  "El Dorado's Legacy": ["Crystal Bone Ring"],
  "Eye of the Spider": ["Spider's Eye Ring"],
  "Fractured Blade": ["Crystal Sword"],
  "Hellfire Edge": ["Demon Blade"],
  "High Voltage": ["Conducting Wand"],
  "Infernal Anger": ["Berserker's Breastplate"],
  "Kogbold Spirit": ["Overclocking Amulet"],
  "Living Hive": ["Bee Armors"],
  "Masked God's Dance": ["Robe of the Tlatoani"],
  "Molecular Blade": ["Pirate King's Cutlass"],
  "Necrotic Knowledge": ["Ring of Skeletal Specters"],
  "Night's Soul": ["Circlet & Oryx Rings"],
  "Night's Strength": ["Oryx Weapons"],
  "Night's Tenacity": ["Oryx Armors"],
  "Night's Wisdom": ["Oryx Abilities"],
  "Raijin's Dance": ["Tlatoani's Shroud"],
  "Soulful Mastery": ["Doom Bow"],
  "Swarm Tree's Wrath": ["Leaf Bow"],
  "The King's Treasure": ["Corsair Ring"],
  "Thornswarm": ["Bramble Bow"],
  "Venom Coating": ["Poison Fang Dagger"]
};
const AWAKEN_ITEM_TYPE = {
  "Tomb rings": "RING", "Snakeskin Armor": "ARMOR", "Doku No Ken": "WEAPON",
  "Staff of Extreme Prejudice": "WEAPON", "Bone Dagger": "WEAPON",
  "Queen's Stinger": "WEAPON", "Staff of the Crystal Serpent": "WEAPON",
  "Crystal Wand": "WEAPON", "Snake Eye Ring": "RING", "LoD Armors": "ARMOR",
  "Crystal Bone Ring": "RING", "Spider's Eye Ring": "RING", "Crystal Sword": "WEAPON",
  "Demon Blade": "WEAPON", "Conducting Wand": "WEAPON", "Berserker's Breastplate": "ARMOR",
  "Overclocking Amulet": "RING", "Bee Armors": "ARMOR", "Robe of the Tlatoani": "ARMOR",
  "Pirate King's Cutlass": "WEAPON", "Ring of Skeletal Specters": "RING",
  "Circlet & Oryx Rings": "RING", "Oryx Weapons": "WEAPON", "Oryx Armors": "ARMOR",
  "Oryx Abilities": "ABILITY", "Tlatoani's Shroud": "ARMOR", "Doom Bow": "WEAPON",
  "Leaf Bow": "WEAPON", "Corsair Ring": "RING", "Bramble Bow": "WEAPON", "Poison Fang Dagger": "WEAPON"
};
let AWAKENABLE_ITEMS = [], chosenAwakenItem = "";

const ENCHANT_SLOT_GRID_COUNT = 4;
