export type LibraryTrack = {
  id: string;
  title: string;
  artist: string;
  album: string;
  genre: string;
  duration: string;
  durationSeconds: number;
  bpm: number;
  key: string;
};

export type Playlist = {
  id: string;
  name: string;
  icon?: string;
};

export const PLAYLISTS: Playlist[] = [
  { id: "recent", name: "Recently Added" },
  { id: "favorites", name: "Favorites" },
  { id: "30augvibe", name: "30augvibe" },
  { id: "house", name: "House Mix" },
  { id: "techno", name: "Techno Set" },
];

export const LIBRARY_TRACKS: LibraryTrack[] = [
  {
    id: "1",
    title: "Abracadabra",
    artist: "Lady Gaga",
    album: "MAYHEM",
    genre: "Dance",
    duration: "3:45",
    durationSeconds: 225,
    bpm: 114,
    key: "Ab",
  },
  {
    id: "2",
    title: "Blinding Lights",
    artist: "The Weeknd",
    album: "After Hours",
    genre: "Synth-pop",
    duration: "3:20",
    durationSeconds: 200,
    bpm: 171,
    key: "Fm",
  },
  {
    id: "3",
    title: "One More Time",
    artist: "Daft Punk",
    album: "Discovery",
    genre: "House",
    duration: "5:20",
    durationSeconds: 320,
    bpm: 123,
    key: "Bm",
  },
  {
    id: "4",
    title: "Strobe",
    artist: "deadmau5",
    album: "For Lack of a Better Name",
    genre: "Progressive House",
    duration: "10:37",
    durationSeconds: 637,
    bpm: 128,
    key: "F#m",
  },
  {
    id: "5",
    title: "Levels",
    artist: "Avicii",
    album: "True",
    genre: "Progressive House",
    duration: "3:19",
    durationSeconds: 199,
    bpm: 126,
    key: "C#m",
  },
  {
    id: "6",
    title: "Sandstorm",
    artist: "Darude",
    album: "Before the Storm",
    genre: "Trance",
    duration: "3:45",
    durationSeconds: 225,
    bpm: 136,
    key: "Bm",
  },
  {
    id: "7",
    title: "Insomnia",
    artist: "Faithless",
    album: "Reverence",
    genre: "Trance",
    duration: "6:46",
    durationSeconds: 406,
    bpm: 127,
    key: "Am",
  },
  {
    id: "8",
    title: "Gypsy Woman",
    artist: "Crystal Waters",
    album: "Surprise",
    genre: "House",
    duration: "3:54",
    durationSeconds: 234,
    bpm: 120,
    key: "Gm",
  },
];
