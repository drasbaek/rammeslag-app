import { MATCHES, SEED_PLAYERS, SESSIONS, ENTRY_RATINGS } from "./lib/mock/seed";
import { replay } from "./lib/mock/engine";

const { ratings, matchesPlayed } = replay(MATCHES, ENTRY_RATINGS);
const rows = SEED_PLAYERS.map((p) => ({
  name: p.name,
  guest: p.is_guest ? "G" : "",
  rating: Math.round(ratings[p.id] ?? p.entry_rating),
  matches: matchesPlayed[p.id] ?? 0,
})).sort((a, b) => b.rating - a.rating);
console.table(rows);
const members = rows.filter((r) => !r.guest);
const guests = rows.filter((r) => r.guest);
console.log("members", members.length, "range", Math.min(...members.map(m=>m.rating)), "-", Math.max(...members.map(m=>m.rating)));
console.log("member matches", Math.min(...members.map(m=>m.matches)), "-", Math.max(...members.map(m=>m.matches)));
console.log("guests", guests.length, "range", Math.min(...guests.map(m=>m.rating)), "-", Math.max(...guests.map(m=>m.rating)), "matches", Math.min(...guests.map(m=>m.matches)), "-", Math.max(...guests.map(m=>m.matches)));
console.log("sessions", SESSIONS.length, "matches", MATCHES.length);
