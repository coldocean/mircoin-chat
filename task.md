# mIRCoin Chat - Build Progress

## Done
- [x] Database schema (users, channels, channel_messages, channel_users, channel_bans)
- [x] WS types (client + server message types)
- [x] WS handler (full IRC command handling, PM relay, roles, admin)
- [x] Server.ts with WebSocket support (production)
- [x] Vite WS dev plugin (dev mode WebSocket)
- [x] Design system (design.md)
- [x] CSS styles (dark/light themes, IRC colors, nick colors)
- [x] Crypto utils (ECDH, AES-256-GCM, image compress)
- [x] IRC store (zustand-like state management)
- [x] IRC hook (WebSocket connection, message routing)
- [x] Command parser (all mIRC commands)
- [x] ChannelPanel component (left sidebar)
- [x] UserPanel component (right sidebar)
- [x] ChatArea component (center chat)

## TODO
- [ ] CommandInput component (bottom input bar)
- [ ] ThemeToggle component
- [ ] Main page layout (index.tsx)
- [ ] App.tsx routing
- [ ] API index.ts (basic routes)
- [ ] Push DB schema
- [ ] Test build
- [ ] Fix any errors
