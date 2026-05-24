import { PlayerId, ClubId } from '../domain/ids'
import { Season } from '../domain/season'
import { Player } from '../domain/player'
import { Club } from '../domain/club'
import { Membership } from '../domain/membership'

export const clubs: Club[] = [
  { id: ClubId('stade-toulousain'),   name: 'Stade Toulousain' },
  { id: ClubId('racing-92'),          name: 'Racing 92' },
  { id: ClubId('clermont'),           name: 'ASM Clermont' },
  { id: ClubId('la-rochelle'),        name: 'Stade Rochelais' },
  { id: ClubId('bordeaux-begles'),    name: 'Union Bordeaux-Bègles' },
]

export const players: Player[] = [
  // Stade Toulousain alumni
  { id: PlayerId('p1'),  name: 'Antoine Dupont' },
  { id: PlayerId('p2'),  name: 'Romain Ntamack' },
  { id: PlayerId('p3'),  name: 'Cyril Baille' },
  // Racing 92 alumni
  { id: PlayerId('p4'),  name: 'Gaël Fickou' },
  { id: PlayerId('p5'),  name: 'Donovan Taofifenua' },
  { id: PlayerId('p6'),  name: 'Teddy Thomas' },
  // Clermont alumni
  { id: PlayerId('p7'),  name: 'Damian Penaud' },
  { id: PlayerId('p8'),  name: 'Idriss Abdehouche' },
  { id: PlayerId('p9'),  name: 'Julien Marchand' },
  // La Rochelle alumni
  { id: PlayerId('p10'), name: 'Grégory Alldritt' },
  { id: PlayerId('p11'), name: 'Uini Atonio' },
  { id: PlayerId('p12'), name: 'Pierre Bourgarit' },
  // Bordeaux-Bègles alumni
  { id: PlayerId('p13'), name: 'Maxime Lucu' },
  { id: PlayerId('p14'), name: 'Cameron Woki' },
  { id: PlayerId('p15'), name: 'Matthieu Jalibert' },
  // Bridge players (cross-club memberships to enable varied paths)
  { id: PlayerId('p16'), name: 'Louis Picamoles' },
  { id: PlayerId('p17'), name: 'Yoann Maestri' },
  { id: PlayerId('p18'), name: 'Florian Fritz' },
]

export const memberships: Membership[] = [
  // Stade Toulousain 2022-2023
  { playerId: PlayerId('p1'),  clubId: ClubId('stade-toulousain'),  season: Season('2022-2023') },
  { playerId: PlayerId('p2'),  clubId: ClubId('stade-toulousain'),  season: Season('2022-2023') },
  { playerId: PlayerId('p3'),  clubId: ClubId('stade-toulousain'),  season: Season('2022-2023') },

  // Racing 92 2022-2023
  { playerId: PlayerId('p4'),  clubId: ClubId('racing-92'),         season: Season('2022-2023') },
  { playerId: PlayerId('p5'),  clubId: ClubId('racing-92'),         season: Season('2022-2023') },
  { playerId: PlayerId('p6'),  clubId: ClubId('racing-92'),         season: Season('2022-2023') },

  // Clermont 2022-2023
  { playerId: PlayerId('p7'),  clubId: ClubId('clermont'),          season: Season('2022-2023') },
  { playerId: PlayerId('p8'),  clubId: ClubId('clermont'),          season: Season('2022-2023') },
  { playerId: PlayerId('p9'),  clubId: ClubId('clermont'),          season: Season('2022-2023') },

  // La Rochelle 2022-2023
  { playerId: PlayerId('p10'), clubId: ClubId('la-rochelle'),       season: Season('2022-2023') },
  { playerId: PlayerId('p11'), clubId: ClubId('la-rochelle'),       season: Season('2022-2023') },
  { playerId: PlayerId('p12'), clubId: ClubId('la-rochelle'),       season: Season('2022-2023') },

  // Bordeaux-Bègles 2022-2023
  { playerId: PlayerId('p13'), clubId: ClubId('bordeaux-begles'),   season: Season('2022-2023') },
  { playerId: PlayerId('p14'), clubId: ClubId('bordeaux-begles'),   season: Season('2022-2023') },
  { playerId: PlayerId('p15'), clubId: ClubId('bordeaux-begles'),   season: Season('2022-2023') },

  // Bridge: p16 played at Toulouse then Racing → links p1-p2 cluster to p4-p5 cluster (path length 2)
  { playerId: PlayerId('p16'), clubId: ClubId('stade-toulousain'),  season: Season('2021-2022') },
  { playerId: PlayerId('p16'), clubId: ClubId('racing-92'),         season: Season('2022-2023') },

  // Bridge: p17 played at Racing then Clermont → p4 cluster ↔ p7 cluster (path length 2 via p16+p17)
  { playerId: PlayerId('p17'), clubId: ClubId('racing-92'),         season: Season('2021-2022') },
  { playerId: PlayerId('p17'), clubId: ClubId('clermont'),          season: Season('2022-2023') },

  // Bridge: p18 played at Clermont then La Rochelle → extends chain to length 4 (p1→p16→p17→p18→p10)
  { playerId: PlayerId('p18'), clubId: ClubId('clermont'),          season: Season('2021-2022') },
  { playerId: PlayerId('p18'), clubId: ClubId('la-rochelle'),       season: Season('2022-2023') },

  // p9 also played at Bordeaux → direct link Clermont↔Bordeaux (path p7→p9→p13, length 2)
  { playerId: PlayerId('p9'),  clubId: ClubId('bordeaux-begles'),   season: Season('2021-2022') },
]

/*
  Example paths (player → shared club/season → player):
  Length 2: p1 — [Toulouse 2021-22 via p16] — p4    (p1 → p16 → p4)
  Length 2: p4 — [Racing 2021-22 via p17]   — p7    (p4 → p17 → p7)
  Length 2: p7 — [Clermont 2021-22 via p18] — p10   (p7 → p18 → p10)
  Length 3: p1 → p16 → p17 → p7
  Length 4: p1 → p16 → p17 → p18 → p10
  Direct:   p2 — p3 (shared Toulouse 2022-23), length 1
*/
