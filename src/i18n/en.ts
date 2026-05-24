const en = {
  home: {
    title: 'Rugby Connections',
    tagline: 'Six Degrees of Separation — Rugby Edition',
    launchGame: 'Launch Game',
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
  },
  victory: {
    heading: 'Congratulations!',
    moves: 'Moves',
    time: 'Time',
    playAgain: 'Play Again',
  },
}

export type Translations = typeof en
export default en
