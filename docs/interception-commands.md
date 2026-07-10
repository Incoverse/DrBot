# Interception Chat Commands

Interception lets chat/moderators mess with a streamer's physical keyboard and mouse in real time. Through the **Waiter Manager (wmgr)** client running on the streamer's PC, Waiter can:

- **Block** keys and mouse inputs (they stop working),
- **Redirect** keys (press A, the OS sees Z),
- **Delay** keyboard/mouse input (add artificial lag),
- **Emulate** input (press keys, click, move, scroll — as if the streamer did it),
- Run saved **presets** and **scripts** for repeatable chaos.

## Prerequisites

1. A **Waiter Manager (wmgr)** client must be connected for the channel. If not, every command replies with `No Waiter Manager is connected for this channel.`
2. The Interception **driver must be installed** on the machine — run `!ix install` once (a reboot may be required).
3. To **block/redirect/delay**, and to **emulate** input (press, click, move, scroll, scripts), Interception must be **enabled** — run `!ix enable`. Emulation commands that run while disabled reply `Enable interception first: !ix enable`.

> **Permissions:** Every command in this document requires the **Developer** permission level (`@RequiresPermission(TwitchPermissions.Developer)`). These are not open to regular chat.

---

## Quick reference

| Command | Syntax | What it does |
| --- | --- | --- |
| `!ix` / `!interception` | `!ix <enable\|disable\|install\|uninstall\|status\|state\|clear\|panic>` | Control the driver + interception state |
| `!block` | `!block <tokens…>` | Disable keys / mouse inputs |
| `!unblock` | `!unblock <tokens…>` | Re-enable previously blocked inputs |
| `!redirect` | `!redirect a -> z, z -> a` | Remap keys (comma-separated `from -> to` pairs) |
| `!unredirect` | `!unredirect <keys…>` | Remove redirects for those keys |
| `!keydelay` | `!keydelay <seconds>` | Artificial keyboard lag (0 = off) |
| `!mousedelay` | `!mousedelay <seconds>` | Artificial mouse lag (0 = off) |
| `!press` / `!tap` | `!press <key> [key…]` | Emulate key press(es) in sequence |
| `!combo` / `!chord` | `!combo <key> <key> …` | Emulate a chord (all down, then up reversed) |
| `!click` | `!click [lmb\|rmb\|mmb\|x1\|x2]` | Emulate a mouse click (default lmb) |
| `!move` | `!move <up\|down\|left\|right> [px]` or `!move <dx> <dy>` | Emulate relative mouse movement |
| `!scroll` | `!scroll <up\|down> [amount]` or `!scroll <signed>` | Emulate a scroll tick |
| `!preset` | `!preset <name>` | Load a saved preset onto the client |
| `!presets` | `!presets` | List saved presets |
| `!script` | `!script <name>` | Compile + run a saved script |
| `!scripts` | `!scripts` | List saved scripts |
| `!stopscript` | `!stopscript` | Stop running script(s) |

All commands require **Developer** permission.

---

## Input tokens (keys & mouse)

Many commands take **tokens**. Lists are split on **spaces, commas, and plus signs** — so `!block ctrl, alt space` and `!press ctrl+w` both work.

### Key tokens

A key token resolves in this order: a **friendly alias**, then a `KeyboardEvent.code` (e.g. `KeyA`, `Digit1`, `ArrowUp`), then a single letter/digit, then a raw scancode.

Common aliases (case-insensitive):

| You type | Key |
| --- | --- |
| `alt` / `lalt` / `ralt` | Left / Right Alt |
| `ctrl` / `control` / `lctrl` / `rctrl` | Left / Right Control |
| `shift` / `lshift` / `rshift` | Left / Right Shift |
| `meta` / `win` / `windows` / `cmd` / `super` | Windows / Meta key |
| `space` / `spacebar` | Space |
| `enter` / `return` / `cr` | Enter |
| `tab`, `esc` / `escape`, `caps` / `capslock` | Tab, Escape, Caps Lock |
| `backspace` / `bksp` / `bs`, `del` / `delete`, `ins` / `insert` | Backspace, Delete, Insert |
| `home`, `end`, `pageup` / `pgup`, `pagedown` / `pgdn` | Navigation keys |
| `up` / `down` / `left` / `right` | Arrow keys |
| `minus`, `equal` / `plus`, `comma`, `period` / `dot`, `slash`, `backslash`, `semicolon`, `quote`, `tilde` / `backtick` / `grave` | Punctuation |
| `a`–`z`, `0`–`9` | Letter/digit keys |

### Mouse tokens (for `!block` / `!unblock`)

- **Buttons:** `lmb` / `left` / `m1` / `mouse1`, `rmb` / `right` / `m2` / `mouse2`, `mmb` / `middle` / `m3` / `mouse3`, `x1` / `mb4` / `side1` / `mouse4`, `x2` / `mb5` / `side2` / `mouse5`
- **Movement:** `mouse_up` / `mup` / `moveup`, `mouse_down`, `mouse_left`, `mouse_right`
- **Scroll:** `scroll_up` / `sup` / `wheelup`, `scroll_down` / `sdown` / `wheeldown`

Unrecognized tokens are ignored and echoed back so you can fix typos.

---

## `!ix` / `!interception` — control command

```
!ix <enable|disable|install|uninstall|status|state|clear|panic>
!interception <…>
```

One required action word. What each does:

| Action | Effect |
| --- | --- |
| `enable` | Turn interception on (needed before emulating input). |
| `disable` | Turn interception off **and clear all filters** (blocks, redirects, delay). |
| `install` | Install the Interception driver. May report *"a reboot is required to finish."* |
| `uninstall` | Uninstall the driver. May also require a reboot. |
| `status` | Query the client: `Installed: yes/no · Enabled: yes/no · [reboot pending] · Devices: N`. |
| `state` | Show Waiter's current filter state: enabled/disabled, blocked keys, redirects (`from→to`), and delay (`kb=… mouse=…`). |
| `clear` | Clear all interception filters (keys, mouse, delay, scripts) **without** disabling the driver. |
| `panic` | Emergency stop — see [Emergency / panic](#emergency--panic). |

Examples:

```
!ix install
!ix enable
!ix state
!ix disable
```

---

## `!block` / `!unblock` — disable inputs

```
!block <token> [token…]
!unblock <token> [token…]
```

Blocks (or re-enables) any mix of **key tokens** and **mouse tokens** (see [Input tokens](#input-tokens-keys--mouse)). Keys are batched; each mouse op is applied individually.

Examples:

```
!block w a s d space          # disable WASD + jump
!block lmb scroll_up          # disable left click and scroll-up
!unblock w a s d space
```

---

## `!redirect` / `!unredirect` — remap keys

```
!redirect <from> -> <to>[, <from> -> <to> …]
!unredirect <key> [key…]
```

- **`!redirect`** takes one or more **`from -> to` pairs, separated by commas**. The arrow can be `->`, `→`, or plain `>`. Both sides must resolve to a valid key token. Bad pairs are reported and skipped.
- **`!unredirect`** takes a space/comma list of keys and removes each one's redirect.

Examples:

```
!redirect a -> z, z -> a      # swap A and Z
!redirect w -> s              # walking forward now walks back
!unredirect a, z
```

---

## `!keydelay` / `!mousedelay` — input lag

```
!keydelay <seconds>
!mousedelay <seconds>
```

Adds artificial lag to keyboard or mouse input. Accepts **decimals**; `0` clears that delay. The two delays are tracked independently (setting one preserves the other).

Examples:

```
!keydelay 0.5     # half-second keyboard lag
!mousedelay 1     # 1s mouse lag
!keydelay 0       # clear keyboard delay
```

---

## `!press` / `!tap` / `!combo` / `!chord` — emulate key presses

```
!press <key> [key…]      (alias: !tap)
!combo <key> <key> …     (alias: !chord)
```

Requires interception **enabled**.

- **`!press` / `!tap`** — presses each key **in sequence** (down+up, one after another).
- **`!combo` / `!chord`** — presses a **chord**: all keys down in order, then released in reverse. Great for shortcuts.

Keys use the [key token](#key-tokens) rules. Unknown tokens are ignored and echoed.

Examples:

```
!press enter
!press h i                    # types "hi" (h, then i)
!combo ctrl w                 # close tab (Ctrl+W)
!combo alt f4                 # you monster
```

---

## `!click` / `!move` / `!scroll` — emulate mouse

```
!click [lmb|rmb|mmb|x1|x2]
!move <up|down|left|right> [px]      OR   !move <dx> <dy>
!scroll <up|down> [amount]           OR   !scroll <signed number>
```

Requires interception **enabled**.

- **`!click`** — clicks a button; defaults to **left** if none given. Accepts `lmb`/`left`/`m1`, `rmb`/`right`/`m2`, `mmb`/`middle`/`m3`, `x1`, `x2` (and aliases).
- **`!move`** — either a **direction + optional pixel distance** (default **50px**), or an explicit relative **`dx dy`** (+x = right, +y = down).
- **`!scroll`** — either a **direction + optional amount** (default one tick = **120**), or a single **signed number** (positive = up, negative = down).

Examples:

```
!click                        # left click
!click rmb
!move up                      # move up 50px
!move up 200
!move -30 15                  # 30px left, 15px down
!scroll down                  # one tick down
!scroll up 480                # 4 ticks up
!scroll -120                  # one tick down
```

---

## `!preset` / `!presets` — saved snapshots

```
!preset <name>
!presets
```

Presets are `{disabled keys, key redirects, mouse state}` snapshots stored per channel — the same ones authored on the dashboard's **Testing** tab.

- **`!preset <name>`** loads a preset onto the connected client. Loading **replaces** the current keyboard + mouse filter (like clicking "Load" in the UI). Name match is case-insensitive; unknown names list available presets.
- **`!presets`** (or `!preset` with no name) lists saved presets.

Examples:

```
!presets
!preset chaos
```

---

## Scripts (DSL)

Scripts are little programs authored on the dashboard **Testing** tab in a line-based DSL and run on the connected client.

```
!script <name>       (alias: !runscript) — compile + run a saved script
!scripts             — list saved scripts
!stopscript          — stop running script(s)
```

- **`!script <name>`** compiles the stored script and runs it **server-side** (so loops, chance, and ranges work). It's fire-and-forget — a long/looping script won't block chat. Compile errors are reported with the offending line; a script that compiles to zero steps is rejected.
- **`!scripts`** (or `!script` with no name) lists saved scripts.
- **`!stopscript`** cancels any running script(s) and tells the client to stop. Replies with how many were stopped.

Examples:

```
!scripts
!script spinbot
!stopscript
```

### DSL syntax at a glance

Keys are named by `KeyboardEvent.code` (`KeyA`, `Digit1`, `ArrowUp`, `ControlLeft`…). Lines after `#` are comments. Blank lines are ignored.

**Leaf commands:**

| Command | Meaning |
| --- | --- |
| `disable <Key> [Key…]` | Block one or more keys |
| `enable` | Clear ALL restrictions the script applied |
| `redirect <Key> <Key>` | Rewrite the first key to the second |
| `mouse disable <move\|button\|scroll> <name>` | Block a mouse input |
| `mouse redirect <move\|button\|scroll> <from> <to>` | Remap a mouse input |
| `press <Key>` | Emulate a key press |
| `combo <Key> <Key> [Key…]` | Emulate a chord (down in order, up reversed) |
| `click <left\|right\|middle\|x1\|x2>` | Emulate a mouse click |
| `move <dx> <dy>` | Relative mouse move (values may be ranges) |
| `scroll <up\|down> [amount]` | Scroll (amount may be a range; default 1 tick = 120) |
| `sleep <duration>` | Wait |
| `delay <keyboard\|mouse\|both> <seconds>` | Set artificial input lag |

**Block commands** (require a `{ … }` body, closed with `}`):

| Command | Meaning |
| --- | --- |
| `loop <count\|duration> { … }` | Repeat the block. `loop 5`, `loop 30s`, `loop 3..7`, `loop 2s..5s` |
| `chance <percent>% { … }` | Run the block with the given probability. `chance 5%`, `chance 5..10%` |

**Numbers, ranges & durations:**

- **Ranges** are written `A..B` and are **re-rolled each pass** at runtime (e.g. `move -20..20 0`, `scroll up 100..300`).
- **Durations** accept `s`/`ms` units and decimals: `sleep 250ms`, `sleep 0.5`, `sleep 0.25..0.75`. A unit on either end of a range applies to the whole range.
- `loop` treats a unit'd argument as a **duration** and a plain number as a **repeat count**.

Example script:

```
# jitter the aim and occasionally spam W
loop 20s {
  move -15..15 -15..15
  sleep 100..300ms
  chance 10% {
    combo ControlLeft KeyW
  }
}
enable
```

---

## Emergency / panic

There are two ways to instantly restore a machine to normal:

### Hardware panic chord (local)

On the streamer's PC, pressing **`Left Ctrl + Left Alt + End`** is a **local hardware escape hatch** built into wmgr. It force-disables interception on the machine directly — no network round-trip, works even if chat/Waiter is unreachable. Always available to the person at the keyboard.

### `!ix panic` (remote)

```
!ix panic
```

Emulates that panic chord **remotely** from chat, fully restoring the machine to the same end state as the physical chord:

- Force-**disables** interception (also clears all key/mouse/delay filters),
- **Stops** every server-driven script and schedule,
- **Clears** any screen-block overlays.

It replies: `🚨 Panic — interception force-disabled, filters cleared, scripts + schedules stopped, screen-block cleared.` The action is logged to the dashboard event feed with the triggering user.
