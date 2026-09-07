# LAB POS shift-state gate

Date: 2026-09-07

- Clears one legacy, non-terminal-bound Store Mode session before the KAT runtime is first mounted.
- Blocks POS rendering until the server has positively returned the terminal shift state.
- A failed or unknown shift check can no longer fall through into the POS.
- The next LAB-POS-01 run must show login and then opening count when no confirmed terminal shift is open.
