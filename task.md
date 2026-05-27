# Current Task

## Password Issue
- Hash verified: `noT1333Deemahseeq` -> `56c2c14...` matches DB
- Server-side test via WS: identify works perfectly
- Likely mobile autocorrect/smart punctuation issue on user's end

## Command Autocomplete Popup
Build terminal-style autocomplete when typing `/`:
- Shows filtered list of matching commands as user types
- Displays command syntax + description
- Click or arrow-key + Enter to select
- Inserts command into input field
- Dismiss on Escape or when not matching

### Commands to include in autocomplete:
All from commands.ts switch cases with their usage strings.
