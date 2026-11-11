const assert = require("node:assert/strict");
const {
  getSongContentChange,
  hasRequiredSongContentPermissions
} = require("../functions/songContent");

const initial = "[C]Letra inicial";

assert.deepEqual(getSongContentChange(initial, "[C]Letra actualizada"), {
  changesLyrics: true,
  changesChords: false,
  requiredPermissions: ["songs.editLyrics"],
  isNoOp: false
});

assert.deepEqual(getSongContentChange(initial, "[G]Letra inicial"), {
  changesLyrics: false,
  changesChords: true,
  requiredPermissions: ["songs.editChords"],
  isNoOp: false
});

assert.deepEqual(getSongContentChange(initial, "[G]Letra actualizada"), {
  changesLyrics: true,
  changesChords: true,
  requiredPermissions: ["songs.editLyrics", "songs.editChords"],
  isNoOp: false
});

const combinedChange = getSongContentChange(initial, "[G]Letra actualizada");
assert.equal(
  hasRequiredSongContentPermissions(combinedChange.requiredPermissions, (permission) => permission === "songs.editLyrics"),
  false,
  "A combined update must be denied when chords permission is absent."
);
assert.equal(
  hasRequiredSongContentPermissions(combinedChange.requiredPermissions, (permission) => permission === "songs.editChords"),
  false,
  "A combined update must be denied when lyrics permission is absent."
);
assert.equal(
  hasRequiredSongContentPermissions(combinedChange.requiredPermissions, () => true),
  true,
  "A combined update must be allowed only when both permissions are present."
);

assert.deepEqual(getSongContentChange(initial, initial), {
  changesLyrics: false,
  changesChords: false,
  requiredPermissions: [],
  isNoOp: true
});

console.log("song content permission classification: OK");
