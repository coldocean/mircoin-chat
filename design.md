# mIRCoin Chat — Design System

## Visual Identity
- Classic mIRC-inspired layout with modern polish
- Three-panel layout: channels (left), chat (center), users (right)
- Terminal aesthetic meets modern web design

## Typography
- **Chat text:** JetBrains Mono (monospace) — all IRC messages, timestamps, nicks
- **UI chrome:** Inter — panel headers, buttons, modals
- Size hierarchy: 14px chat, 12px timestamps, 16px panel headers

## Color Palette

### Dark Theme (default)
- Background: #0a0e14 (deep navy-black)
- Panel BG: #111720
- Panel borders: #1a2233
- Chat area: #0d1117
- Primary text: #c9d1d9
- Timestamps: #484f58
- Nicknames: rotating IRC colors (#ff6b6b, #4ecdc4, #45b7d1, #96ceb4, #ffeaa7, #dfe6e9, #fd79a8, #a29bfe)
- Own nick: #ffd700 (gold)
- Server messages: #58a6ff
- Error: #f85149
- Action (/me): #bc8cff
- Join/Part: #3fb950 / #da3633
- Accent: #58a6ff (links, highlights)
- Input BG: #161b22
- Input border: #30363d

### Light Theme
- Background: #ffffff
- Panel BG: #f6f8fa
- Panel borders: #d0d7de
- Chat area: #ffffff
- Primary text: #1f2328
- Timestamps: #656d76
- Server messages: #0969da
- Input BG: #f6f8fa

## Layout
- Left panel: 220px — server tree + channel list
- Center: flex — chat messages + input
- Right panel: 180px — user list (ops, voiced, regular)
- Top bar: minimal — app name, connection status, theme toggle
- Bottom: single-line command input with "/" prefix support

## Spacing
- Panel padding: 8px
- Message line-height: 1.5
- Message padding: 2px 8px
- Compact density — IRC style, no bubbles

## Animation
- Minimal — fade in for new messages
- No scroll animations
- Subtle highlight on mention
