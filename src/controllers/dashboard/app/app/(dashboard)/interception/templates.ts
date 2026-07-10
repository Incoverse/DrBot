// ── Prebuilt interception effect templates ───────────────────────────────────
// A curated library of fun, SAFE effects authored in the script DSL (see
// scriptDsl.ts). Each `source` is valid DSL text a mod can one-click load into
// the editor or save as a personal script. Blocks (`loop`/`chance`) require the
// opening `{` on the header line and a lone `}` to close — mirror that here.
//
// NOTE: every emulation/redirect/disable effect only takes hold while
// interception is INSTALLED + ENABLED. Use the "Reset" template (bare `enable`)
// to clear everything an effect applied.

export const EFFECT_TEMPLATES: { name: string; description: string; source: string }[] = [
  {
    name: "Butterfingers",
    description:
      "For ~30s, small random chance each tick to fire a stray 'E' keypress. Requires interception enabled.",
    source: `# Butterfingers — the occasional fat-fingered key
loop 30s {
  chance 6% {
    press KeyE
  }
  sleep 0.25..0.75
}`,
  },
  {
    name: "Drunk mouse",
    description:
      "Jitters the cursor with tiny random nudges for ~20s. Requires interception enabled.",
    source: `# Drunk mouse — small random cursor jitter
loop 20s {
  move -25..25 -25..25
  sleep 120..300ms
}`,
  },
  {
    name: "Mirror WASD",
    description:
      "Swaps movement keys: W<->S and A<->D. Everything feels inverted. Clear with Reset. Requires interception enabled.",
    source: `# Mirror WASD — invert movement
redirect KeyW KeyS
redirect KeyS KeyW
redirect KeyA KeyD
redirect KeyD KeyA`,
  },
  {
    name: "Slow hands",
    description:
      "Adds 0.4s of artificial lag to both keyboard and mouse input. Clear with Reset. Requires interception enabled.",
    source: `# Slow hands — input lag on everything
delay both 0.4`,
  },
  {
    name: "No space",
    description:
      "Blocks the Spacebar entirely (no jumping / no shooting). Clear with Reset. Requires interception enabled.",
    source: `# No space — Spacebar is dead
disable Space`,
  },
  {
    name: "Random scroll",
    description:
      "For ~15s, occasionally rolls the scroll wheel up by a random amount. Requires interception enabled.",
    source: `# Random scroll — surprise wheel spins
loop 15s {
  chance 20% {
    scroll up 40..160
  }
  sleep 200..600ms
}`,
  },
  {
    name: "Sticky keys chaos",
    description:
      "For ~25s, independent small chances to spam a stray W, A, or D. Requires interception enabled.",
    source: `# Sticky keys chaos — random movement twitches
loop 25s {
  chance 8% {
    press KeyW
  }
  chance 8% {
    press KeyA
  }
  chance 8% {
    press KeyD
  }
  sleep 0.3..0.8
}`,
  },
  {
    name: "Reverse mouse",
    description:
      "Fully inverts mouse movement — up/down and left/right are swapped. Clear with Reset. Requires interception enabled.",
    source: `# Reverse mouse — every direction flipped
mouse redirect move up down
mouse redirect move down up
mouse redirect move left right
mouse redirect move right left`,
  },
  {
    name: "Inverted Y",
    description:
      "Inverts only the vertical mouse axis (classic 'inverted look'). Clear with Reset. Requires interception enabled.",
    source: `# Inverted Y — vertical aim flipped
mouse redirect move up down
mouse redirect move down up`,
  },
  {
    name: "Left-handed",
    description:
      "Swaps WASD with the arrow keys, both ways. Clear with Reset. Requires interception enabled.",
    source: `# Left-handed — WASD <-> arrow keys
redirect KeyW ArrowUp
redirect KeyA ArrowLeft
redirect KeyS ArrowDown
redirect KeyD ArrowRight
redirect ArrowUp KeyW
redirect ArrowLeft KeyA
redirect ArrowDown KeyS
redirect ArrowRight KeyD`,
  },
  {
    name: "QWERTY scramble",
    description:
      "Swaps several nearby letter pairs (Q<->W, E<->R, A<->S). Typing gets messy. Clear with Reset. Requires interception enabled.",
    source: `# QWERTY scramble — swap a few letter pairs
redirect KeyQ KeyW
redirect KeyW KeyQ
redirect KeyE KeyR
redirect KeyR KeyE
redirect KeyA KeyS
redirect KeyS KeyA`,
  },
  {
    name: "Jump spam",
    description:
      "Presses Spacebar every ~0.2–0.5s for ~10s (constant jumping). Requires interception enabled.",
    source: `# Jump spam — Spacebar on repeat
loop 10s {
  press Space
  sleep 200..500ms
}`,
  },
  {
    name: "Rage clicker",
    description:
      "For ~12s, frequent random left clicks. Requires interception enabled.",
    source: `# Rage clicker — random left clicks
loop 12s {
  chance 30% {
    click left
  }
  sleep 150..400ms
}`,
  },
  {
    name: "Backspace gremlin",
    description:
      "For ~20s, occasional stray Backspace presses. Requires interception enabled.",
    source: `# Backspace gremlin — eats the odd character
loop 20s {
  chance 10% {
    press Backspace
  }
  sleep 0.4..1.0
}`,
  },
  {
    name: "Panic Escape",
    description:
      "For ~20s, occasionally fires the Escape key (closes menus). Requires interception enabled.",
    source: `# Panic Escape — the odd surprise Esc
loop 20s {
  chance 8% {
    press Escape
  }
  sleep 0.5..1.2
}`,
  },
  {
    name: "Number panic",
    description:
      "For ~20s, small independent chances to type random digits. Requires interception enabled.",
    source: `# Number panic — stray digit spam
loop 20s {
  chance 10% {
    press Digit1
  }
  chance 10% {
    press Digit5
  }
  chance 10% {
    press Digit9
  }
  sleep 0.3..0.7
}`,
  },
  {
    name: "Earthquake",
    description:
      "Big violent cursor shakes for ~15s (stronger than Drunk mouse). Requires interception enabled.",
    source: `# Earthquake — large random cursor shakes
loop 15s {
  move -60..60 -60..60
  sleep 80..200ms
}`,
  },
  {
    name: "Molasses",
    description:
      "Heavy 0.8s input lag on keyboard and mouse — everything crawls. Clear with Reset. Requires interception enabled.",
    source: `# Molasses — heavy input lag
delay both 0.8`,
  },
  {
    name: "Wheel lock",
    description:
      "Blocks scrolling entirely (both directions). Clear with Reset. Requires interception enabled.",
    source: `# Wheel lock — scrolling disabled
mouse disable scroll up
mouse disable scroll down`,
  },
  {
    name: "Twitchy aim",
    description:
      "For ~15s, random small cursor nudges plus the occasional click. Requires interception enabled.",
    source: `# Twitchy aim — jittery cursor + stray clicks
loop 15s {
  chance 25% {
    move -40..40 -40..40
  }
  chance 10% {
    click left
  }
  sleep 150..350ms
}`,
  },
  {
    name: "Reset",
    description:
      "Utility: clears ALL restrictions any effect applied (disables, redirects, delays). Run this to undo.",
    source: `# Reset — clear every restriction this session applied
enable`,
  },
];
