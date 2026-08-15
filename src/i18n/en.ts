const en = {
  home: {
    title: 'I Played With',
    tagline: 'Find Teammate connections',
    chooseSportPrompt: 'Choose a sport',
    sports: {
      rugby: 'Rugby',
      football: 'Football',
    },
  },
  common: {
    loading: 'Loading…',
    loadError: 'Something went wrong loading the data. Please try again.',
  },
  setup: {
    title: 'Choose Your Players',
    playerA: 'Player A',
    playerB: 'Player B',
    inputPlaceholder: 'Search a player…',
    randomize: 'Randomize',
    change: 'Change',
    orSeparator: '— or —',
    difficulty: 'Difficulty',
    easy: 'Easy',
    easyDesc: 'Player only',
    hard: 'Hard',
    hardDesc: 'Player + Club + Season',
    launch: 'Launch Game',
    directlyConnectedWarning: 'These two players have already played together. In Easy mode, this link is auto-resolved — please pick a different pair.',
    emptyState: 'No players available yet for this sport — check back soon.',
  },
  game: {
    chrono: 'Time',
    easyPlaceholder: 'Choose a player…',
    submit: 'Submit',
    playerPlaceholder: 'Player…',
    clubPlaceholder: 'Club…',
    seasonPlaceholder: '2022-2023',
    seasonFormatError: 'Expected format: YYYY-YYYY (e.g. 2022-2023)',
    closeError: 'Close',
    clubSearchPlaceholder: 'Search a club…',
    noSuggestions: 'No results',
    addPlayer: 'Player',
    addClub: 'Club',
  },
  victory: {
    heading: 'Congratulations!',
    moves: 'Moves',
    time: 'Time',
    playAgain: 'Play Again',
  },
};

export type Translations = typeof en;
export default en;
