// Passwords that appear at the top of every leaked-password list. Registration and password changes reject
// them (compared case-insensitively). Only entries with at least 8 characters matter, shorter ones already fail
// the length rule.
const COMMON_PASSWORDS = new Set([
  "password", "password1", "password12", "password123", "password1234", "password!", "passw0rd", "p@ssw0rd", "p@ssword",
  "12345678", "123456789", "1234567890", "0123456789", "87654321", "11111111", "00000000", "12341234", "11223344",
  "123123123", "12121212", "88888888", "99999999", "66666666", "55555555", "22222222", "123qweasd", "1q2w3e4r",
  "1q2w3e4r5t", "1qaz2wsx", "zaq12wsx", "qwertyui", "qwertyuiop", "qwerty12", "qwerty123", "qwerty1234", "qwertz123",
  "qwertzui", "asdfghjk", "asdfasdf", "asdf1234", "zxcvbnm1", "abcd1234", "abc12345", "abcdefgh", "aaaaaaaa",
  "iloveyou", "iloveyou1", "sunshine", "princess", "football", "baseball", "basketball", "superman", "batman123",
  "starwars", "whatever", "trustno1", "letmein1", "letmein123", "welcome1", "welcome123", "admin123", "admin1234",
  "administrator", "changeme", "computer", "internet", "michael1", "jennifer", "jordan23", "dragon12", "monkey123",
  "master123", "shadow12", "football1", "charlie1", "liverpool", "chelsea1", "freedom1", "pokemon1", "minecraft",
  "passwort", "passwort1", "passwort123", "hallo123", "schalke04", "fussball", "schatz123", "geheim123",
  "osiris123", "openverse", "open-verse",
]);

export function isCommonPassword(password: string): boolean {
  return COMMON_PASSWORDS.has(password.trim().toLowerCase());
}
