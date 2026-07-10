import { randomUUID } from "crypto";
import type { InteractionResponse, Message } from "discord.js";
import type { RecordId } from "surrealdb";

/*
 * Wordle — a single shared daily game for the whole server.
 *
 * Ported from the old DrBot wordle, adapted for Waiter:
 *  - Custom colored-letter emojis + the external answer/guess word lists are config-driven
 *    (`config.resources.wordle`, ported from the old bot). When that config is absent/incomplete the
 *    board renders with plain Unicode squares (🟩 correct / 🟨 present / ⬛ absent) and the word list
 *    falls back to the bundled list / the default gists.
 *  - Game state lives in the `discord_wordle` table (singleton `discord_wordle:current`) and
 *    per-user stats in `discord_wordle_stats`.
 */

export const SQUARES = { green: "🟩", yellow: "🟨", gray: "⬛", empty: "⬜" } as const;

//? Custom colored-letter emojis, loaded from `config.resources.wordle.emojis` (blank + gray/yellow/
//? green a–z). Shape: `blank.{empty,gray,yellow,green}` + `{gray,yellow,green}.<letter>`. The bot must
//? be able to use these emojis (be in their host server). When the config is absent or incomplete we
//? DO NOT fall back to any hardcoded emoji IDs (those break outside the host server) — renderBoard
//? falls back to the plain Unicode SQUARES instead.
type WordleEmojis = {
  blank: { empty: string; gray: string; yellow: string; green: string };
  gray: Record<string, string>;
  yellow: Record<string, string>;
  green: Record<string, string>;
};

/** Returns the configured custom emojis, or null when they are absent/incomplete (→ plain squares). */
function getConfigEmojis(): WordleEmojis | null {
  const e = global.config?.resources?.wordle?.emojis as WordleEmojis | undefined;
  if (!e || !e.blank || !e.blank.empty || !e.blank.gray || !e.blank.yellow || !e.blank.green) return null;
  if (!e.gray || !e.yellow || !e.green) return null;
  return e;
}
export const MAX_GUESSES = 6;
const DAY_MS = 1000 * 60 * 60 * 24;

/**
 * Bundled 5-letter word list. Used both as the answer pool and the valid-guess dictionary
 * (a guess is accepted only if it appears here). Kept intentionally common/solvable.
 */
export const WORDS: string[] = [
  "apple", "brave", "crane", "drive", "eagle", "flame", "grape", "house", "ivory", "joker",
  "knife", "lemon", "mango", "noble", "ocean", "piano", "quiet", "river", "stone", "table",
  "unity", "vivid", "wheat", "xenon", "yacht", "zebra", "amber", "blaze", "cliff", "dance",
  "ember", "frost", "glory", "haste", "input", "jolly", "karma", "light", "money", "night",
  "olive", "pearl", "quill", "raven", "shine", "trend", "ultra", "vault", "waltz", "yield",
  "acorn", "bloom", "cabin", "delta", "elbow", "fable", "giant", "honey", "index", "jewel",
  "kiosk", "lunar", "medal", "nurse", "onion", "prism", "quest", "robot", "solar", "tiger",
  "urban", "venom", "witty", "youth", "zesty", "actor", "beach", "cider", "donut", "eager",
  "field", "glove", "hotel", "igloo", "jumbo", "koala", "ladle", "maple", "novel", "opera",
  "plant", "quirk", "rhino", "sugar", "torch", "usher", "vocal", "wagon", "xylem", "yeast",
  "angle", "bread", "chair", "dream", "earth", "fairy", "grasp", "hinge", "irate", "juice",
  "kneel", "lodge", "mirth", "nudge", "orbit", "pouch", "quota", "roast", "swirl", "tulip",
  "udder", "vigor", "whale", "yearn", "zonal", "adobe", "brick", "candy", "ditch", "epoch",
  "flint", "gauge", "hardy", "ivory", "jazzy", "kayak", "lyric", "mocha", "ninja", "otter",
];

const WORD_SET = new Set(WORDS);

//? The real Wordle lists, fetched (once). The URLs come from `config.resources.wordle`
//? (`validWords` = the answer pool, `validGuesses` = additional accepted guesses), ported from the
//? old bot; when unset they fall back to the same gists the old bot used:
//?   answers  (~2.3k) = the answer pool     |   allowed (~12.9k) = accepted guesses
//? Falls back to the bundled WORDS if the fetch fails. `answers`/`guessSet` start as the fallback
//? and are swapped in once the fetch resolves.
const DEFAULT_ANSWER_URL = "https://gist.githubusercontent.com/cfreshman/a03ef2cba789d8cf00c08f767e0fad7b/raw/1792f853e1cd0249f7588c724e00d46dbc4894eb/wordle-answers-alphabetical.txt";
const DEFAULT_GUESS_URL = "https://gist.githubusercontent.com/cfreshman/cdcdf777450c5b5301e439061d29694c/raw/b8375870720504ecf89c1970ea4532454f12de94/wordle-allowed-guesses.txt";

const answerUrl = () => global.config?.resources?.wordle?.validWords ?? DEFAULT_ANSWER_URL;
const guessUrl = () => global.config?.resources?.wordle?.validGuesses ?? DEFAULT_GUESS_URL;

let answers: string[] = WORDS;
let guessSet: Set<string> = WORD_SET;
let loadPromise: Promise<void> | null = null;

async function fetchWordList(url: string): Promise<string[]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  return text.split(/\r?\n/).map((w) => w.trim().toLowerCase()).filter((w) => /^[a-z]{5}$/.test(w));
}

/** Fetch the full Wordle word lists once (memoized). Keeps the bundled fallback on failure. */
export function ensureWordLists(): Promise<void> {
  if (!loadPromise) {
    loadPromise = (async () => {
      try {
        const [ans, allowed] = await Promise.all([fetchWordList(answerUrl()), fetchWordList(guessUrl())]);
        if (ans.length) answers = ans;
        guessSet = new Set([...allowed, ...ans, ...WORDS]); //? accepted guesses = allowed ∪ answers ∪ bundled
      } catch (err: any) {
        (global as any).discord?.controller?.logger?.warn?.(
          `Wordle word-list fetch failed — using bundled ${WORDS.length}-word list. (${err?.message ?? err})`,
        );
      }
    })();
  }
  return loadPromise;
}

//? Warm the cache as soon as the module loads so lists are ready by the first play.
void ensureWordLists();

export function isValidWord(guess: string): boolean {
  return guessSet.has(guess.toLowerCase());
}

export function pickRandomWord(): string {
  return answers[Math.floor(Math.random() * answers.length)]!;
}

export type LetterState = "green" | "yellow" | "gray";

/** Evaluates a guess against the answer with correct duplicate handling (greens first, then yellows). */
export function evaluateGuess(answer: string, guess: string): LetterState[] {
  const result: LetterState[] = new Array(5).fill("gray");
  const remaining: Record<string, number> = {};
  for (const ch of answer) remaining[ch] = (remaining[ch] ?? 0) + 1;

  for (let i = 0; i < 5; i++) {
    if (guess[i] === answer[i]) {
      result[i] = "green";
      remaining[guess[i]!]!--;
    }
  }
  for (let i = 0; i < 5; i++) {
    if (result[i] === "green") continue;
    const ch = guess[i]!;
    if ((remaining[ch] ?? 0) > 0) {
      result[i] = "yellow";
      remaining[ch]!--;
    }
  }
  return result;
}

/**
 * Renders the board. When custom emojis are configured (`config.resources.wordle.emojis`) it renders
 * rows of those colored-letter emojis; otherwise it falls back to plain Unicode SQUARES.
 *
 * `cover` mirrors the old `generateBoard(…, cover)` flag: when `true` the guessed letters are hidden
 * behind blank colored tiles (used on the PUBLIC board so spectators only see the color pattern);
 * when `false` the actual guessed letters are shown (used on the player's private ephemeral board).
 * With the plain-squares fallback there are no letters to hide, so `cover` has no visible effect.
 */
export function renderBoard(answer: string, guesses: string[], includeEmpty = true, cover = false): string {
  const emojis = getConfigEmojis();
  const rows: string[] = [];
  for (const guess of guesses) {
    const states = evaluateGuess(answer, guess);
    rows.push(
      states
        .map((s, i) => {
          //? No custom emojis configured → plain colored square (no letter shown).
          if (!emojis) return SQUARES[s];
          //? Public board hides letters behind the colored blank tiles.
          if (cover) return emojis.blank[s];
          const letter = (guess[i] ?? "").toLowerCase();
          //? Custom colored-letter emoji so the board shows the actual guessed letters;
          //? falls back to a plain colored square if a letter has no emoji (non a-z).
          return emojis[s][letter] ?? SQUARES[s];
        })
        .join(""),
    );
  }
  if (includeEmpty) {
    const empty = emojis ? emojis.blank.empty : SQUARES.empty;
    for (let i = guesses.length; i < MAX_GUESSES; i++) {
      rows.push(empty.repeat(5));
    }
  }
  return rows.join("\n");
}

//? In-memory per-user active games (a single daily game, tracked while the user is playing). Mirrors
//? the old bot's `wordle.currentlyPlaying[userId]`: the public `boardMessage`, the last private
//? `lastEphemeralMessage` (edited/replaced as the player interacts) and the expiry `timers`.
export type WordleTimers = {
  gameEndWarning: ReturnType<typeof setTimeout> | null;
  updateMessageTimer: ReturnType<typeof setInterval> | null;
  gameEndTimer: ReturnType<typeof setTimeout> | null;
};
export type ActiveGame = {
  gameId: string;
  guesses: string[];
  startTime: number;
  boardMessage: Message | null;
  lastEphemeralMessage: InteractionResponse | Message | null;
  timers: WordleTimers;
};
export const activeGames = new Map<string, ActiveGame>();

export type WordleRow = {
  word: string;
  game_id: string;
  expires: Date | string;
};

/** Fetches the current daily wordle, or null if none exists yet. */
export async function getCurrentWordle(): Promise<WordleRow | null> {
  const rows = (await global.db
    .query("SELECT word, game_id, expires FROM discord_wordle:current")
    .then((res) => (res?.[0] ?? []) as WordleRow[]));
  return rows[0] ?? null;
}

/**
 * Ensures a non-expired daily wordle exists. If the current one is missing or expired, a new word
 * is chosen and persisted. Returns the active game plus (if one was just replaced) the previous game id.
 */
export async function ensureWordle(): Promise<{ word: string; gameId: string; expires: Date; isNew: boolean; previousGameId: string | null }> {
  const current = await getCurrentWordle();
  const now = Date.now();
  const currentExpires = current ? new Date(current.expires as any).getTime() : 0;

  if (current && currentExpires > now) {
    return { word: current.word, gameId: current.game_id, expires: new Date(currentExpires), isNew: false, previousGameId: null };
  }

  await ensureWordLists(); //? make sure the answer is drawn from the full list (not the fallback)
  const word = pickRandomWord();
  const gameId = randomUUID();
  const expires = new Date(now + DAY_MS);

  await global.db.query(
    "UPSERT discord_wordle:current SET word = $word, game_id = $game_id, expires = $expires, created_at = time::now()",
    { word, game_id: gameId, expires },
  );

  return { word, gameId, expires, isNew: true, previousGameId: current?.game_id ?? null };
}

export type WordleStats = {
  games_played: number;
  games_won: number;
  streak: number;
  longest_streak: number;
  last_played_id?: string | null;
  last_played_solved?: boolean;
  recent?: { time: number; guesses: number }[];
};

export async function getStats(userId: string): Promise<WordleStats | null> {
  const rows = (await global.db
    .query("SELECT * FROM type::record('discord_wordle_stats', $uid)", { uid: userId })
    .then((res) => (res?.[0] ?? []) as (WordleStats & { id: RecordId<"discord_wordle_stats"> })[]));
  return rows[0] ?? null;
}

/**
 * Records the outcome of a finished game and updates the user's streak/stats. Returns the streak
 * before this game (`previousStreak`) and after (`streak`) — the reward system uses `streak` on a win
 * to look up the achieved milestone, and `previousStreak` on a loss to know which tiers to roll back.
 */
export async function recordResult(
  userId: string,
  gameId: string,
  solved: boolean,
  guessCount: number,
  timeMs: number,
): Promise<{ previousStreak: number; streak: number }> {
  const stats = (await getStats(userId)) ?? {
    games_played: 0,
    games_won: 0,
    streak: 0,
    longest_streak: 0,
    recent: [],
  };

  const recent = [...(stats.recent ?? []), { time: timeMs, guesses: guessCount }];
  if (recent.length > 12) recent.shift();

  const previousStreak = stats.streak ?? 0;
  const newStreak = solved ? previousStreak + 1 : 0;
  const longest = Math.max(stats.longest_streak ?? 0, newStreak);

  await global.db.query(
    `UPSERT type::record('discord_wordle_stats', $uid) SET
       games_played = $games_played, games_won = $games_won, streak = $streak,
       longest_streak = $longest, last_played_id = $gameId, last_played_solved = $solved,
       recent = $recent, updated_at = time::now()`,
    {
      uid: userId,
      games_played: (stats.games_played ?? 0) + 1,
      games_won: (stats.games_won ?? 0) + (solved ? 1 : 0),
      streak: newStreak,
      longest,
      gameId,
      solved,
      recent,
    },
  );

  return { previousStreak, streak: newStreak };
}

/** Resets streaks for everyone who did not solve the previous daily game (called when a new game rolls over). */
export async function resetMissedStreaks(previousGameId: string): Promise<void> {
  await global.db.query(
    `UPDATE discord_wordle_stats SET streak = 0
       WHERE streak > 0 AND (last_played_id != $gid OR (last_played_id = $gid AND last_played_solved = false))`,
    { gid: previousGameId },
  );
}
