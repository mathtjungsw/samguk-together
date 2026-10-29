export const CHAT_PREVIEW_LIMIT=10;
export const chatAnnouncement=m=>m.kind!=='system'||/^(update-|season-end-|season-start-)/.test(m.eventId||'');
export const publicChat=messages=>messages.filter(chatAnnouncement);
