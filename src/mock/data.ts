import { Club } from '../domain/club';
import { ClubId, PlayerId } from '../domain/ids';
import { Membership } from '../domain/membership';
import { Player } from '../domain/player';
import { Season } from '../domain/season';

// ─── Clubs (Top 14 saison 2024-2025) ───────────────────────────────────────

export const clubs: Club[] = [
  { id: ClubId('stade-toulousain'), name: 'Stade Toulousain' },
  { id: ClubId('bordeaux-begles'), name: 'Union Bordeaux-Bègles' },
  { id: ClubId('toulon'), name: 'RC Toulon' },
  { id: ClubId('bayonne'), name: 'Aviron Bayonnais' },
  { id: ClubId('clermont'), name: 'ASM Clermont' },
  { id: ClubId('castres'), name: 'Castres Olympique' },
  { id: ClubId('la-rochelle'), name: 'Stade Rochelais' },
  { id: ClubId('pau'), name: 'Section Paloise' },
  { id: ClubId('montpellier'), name: 'Montpellier Hérault Rugby' },
  { id: ClubId('racing-92'), name: 'Racing 92' },
  { id: ClubId('lyon'), name: 'LOU Rugby' },
  { id: ClubId('stade-francais'), name: 'Stade Français Paris' },
  { id: ClubId('perpignan'), name: 'USA Perpignan' },
  { id: ClubId('vannes'), name: 'RC Vannes' },
];

// ─── Players ────────────────────────────────────────────────────────────────

export const players: Player[] = [
  // Stade Toulousain
  { id: PlayerId('p01'), name: 'Antoine Dupont' },
  { id: PlayerId('p02'), name: 'Romain Ntamack' },
  { id: PlayerId('p03'), name: 'Cyril Baille' },
  { id: PlayerId('p04'), name: 'Julien Marchand' },
  { id: PlayerId('p05'), name: 'Jerome Kaino' }, // bridge: Toulouse → Toulon

  // Bordeaux-Bègles
  { id: PlayerId('p06'), name: 'Matthieu Jalibert' },
  { id: PlayerId('p07'), name: 'Maxime Lucu' },
  { id: PlayerId('p08'), name: 'Cameron Woki' },
  { id: PlayerId('p09'), name: 'Louis Bielle-Biarrey' },
  { id: PlayerId('p10'), name: 'Ben Lam' }, // bridge: Bordeaux → Racing

  // RC Toulon
  { id: PlayerId('p11'), name: 'Baptiste Serin' },
  { id: PlayerId('p12'), name: 'Facundo Isa' },
  { id: PlayerId('p13'), name: 'Charles Ollivon' },
  { id: PlayerId('p14'), name: 'Gaël Fickou' }, // bridge: Racing → Toulouse → Toulon

  // Aviron Bayonnais
  { id: PlayerId('p15'), name: 'Romain Buros' },
  { id: PlayerId('p16'), name: 'Nans Ducuing' },
  { id: PlayerId('p17'), name: 'Yannick Youyoutte' },
  { id: PlayerId('p18'), name: 'Julien Tisseron' },

  // ASM Clermont
  { id: PlayerId('p19'), name: 'Damian Penaud' },
  { id: PlayerId('p20'), name: 'Idriss Abdehouche' },
  { id: PlayerId('p21'), name: 'Étienne Falgoux' },
  { id: PlayerId('p22'), name: 'Clément Lanen' },
  { id: PlayerId('p23'), name: 'George Moala' }, // bridge: Clermont → Lyon

  // Castres Olympique
  { id: PlayerId('p24'), name: 'Rory Kockott' },
  { id: PlayerId('p25'), name: 'Thomas Combezou' },
  { id: PlayerId('p26'), name: 'Mathieu Babillot' },
  { id: PlayerId('p27'), name: 'Pierre-Louis Barassi' }, // bridge: Castres → Lyon

  // Stade Rochelais
  { id: PlayerId('p28'), name: 'Grégory Alldritt' },
  { id: PlayerId('p29'), name: 'Uini Atonio' },
  { id: PlayerId('p30'), name: 'Pierre Bourgarit' },
  { id: PlayerId('p31'), name: 'Antoine Hastoy' }, // bridge: Pau → La Rochelle
  { id: PlayerId('p32'), name: 'Thomas Berjon' },

  // Section Paloise
  { id: PlayerId('p33'), name: 'Lucas Dessaigne' },
  { id: PlayerId('p34'), name: 'Quentin Lespiaucq' },
  { id: PlayerId('p35'), name: 'Julien Delannoy' },
  { id: PlayerId('p36'), name: 'Marko Gazzotti' },

  // Montpellier
  { id: PlayerId('p37'), name: 'Vincent Rattez' },
  { id: PlayerId('p38'), name: 'Zack Holmes' },
  { id: PlayerId('p39'), name: 'Guilhem Guirado' }, // bridge: Toulon → Montpellier
  { id: PlayerId('p40'), name: 'Paul Willemse' },

  // Racing 92
  { id: PlayerId('p41'), name: 'Donovan Taofifenua' },
  { id: PlayerId('p42'), name: 'Teddy Thomas' }, // bridge: Racing → Stade Français
  { id: PlayerId('p43'), name: 'Finn Russell' },
  { id: PlayerId('p44'), name: 'Baptiste Chouzenoux' },

  // LOU Rugby
  { id: PlayerId('p45'), name: 'Baptiste Couilloud' },
  { id: PlayerId('p46'), name: 'Ethan Dumortier' },
  { id: PlayerId('p47'), name: 'Charlie Ngatai' },
  { id: PlayerId('p48'), name: 'Léo Berdeu' }, // bridge: Lyon → Bayonne

  // Stade Français
  { id: PlayerId('p49'), name: 'Joris Segonds' },
  { id: PlayerId('p50'), name: 'Sekou Macalou' },
  { id: PlayerId('p51'), name: 'Waisea Nayacalevu' },
  { id: PlayerId('p52'), name: 'Paul Alo-Emile' },

  // USAP Perpignan
  { id: PlayerId('p53'), name: 'Melvyn Jaminet' }, // bridge: Toulouse → Perpignan
  { id: PlayerId('p54'), name: 'Santiago Arata' },
  { id: PlayerId('p55'), name: 'Selevasio Tolofua' }, // bridge: Toulouse → Castres → Perpignan

  // RC Vannes
  { id: PlayerId('p56'), name: 'Théo Hannoyer' },
  { id: PlayerId('p57'), name: 'Tristan Peculis' },
  { id: PlayerId('p58'), name: 'Killian Geraci' },
];

// ─── Memberships ────────────────────────────────────────────────────────────

export const memberships: Membership[] = [
  // ── Stade Toulousain ────────────────────────────────────────────────────
  {
    playerId: PlayerId('p01'),
    clubId: ClubId('stade-toulousain'),
    season: Season('2022-2023'),
  },
  {
    playerId: PlayerId('p01'),
    clubId: ClubId('stade-toulousain'),
    season: Season('2023-2024'),
  },
  {
    playerId: PlayerId('p02'),
    clubId: ClubId('stade-toulousain'),
    season: Season('2022-2023'),
  },
  {
    playerId: PlayerId('p02'),
    clubId: ClubId('stade-toulousain'),
    season: Season('2023-2024'),
  },
  {
    playerId: PlayerId('p03'),
    clubId: ClubId('stade-toulousain'),
    season: Season('2022-2023'),
  },
  {
    playerId: PlayerId('p03'),
    clubId: ClubId('stade-toulousain'),
    season: Season('2023-2024'),
  },
  {
    playerId: PlayerId('p04'),
    clubId: ClubId('stade-toulousain'),
    season: Season('2022-2023'),
  },
  {
    playerId: PlayerId('p04'),
    clubId: ClubId('stade-toulousain'),
    season: Season('2023-2024'),
  },
  {
    playerId: PlayerId('p05'),
    clubId: ClubId('stade-toulousain'),
    season: Season('2021-2022'),
  }, // bridge Toulouse→Toulon
  {
    playerId: PlayerId('p53'),
    clubId: ClubId('stade-toulousain'),
    season: Season('2021-2022'),
  }, // Jaminet à Toulouse avant Perpignan
  {
    playerId: PlayerId('p55'),
    clubId: ClubId('stade-toulousain'),
    season: Season('2020-2021'),
  }, // Tolofua à Toulouse

  // ── Bordeaux-Bègles ─────────────────────────────────────────────────────
  {
    playerId: PlayerId('p06'),
    clubId: ClubId('bordeaux-begles'),
    season: Season('2022-2023'),
  },
  {
    playerId: PlayerId('p06'),
    clubId: ClubId('bordeaux-begles'),
    season: Season('2023-2024'),
  },
  {
    playerId: PlayerId('p07'),
    clubId: ClubId('bordeaux-begles'),
    season: Season('2022-2023'),
  },
  {
    playerId: PlayerId('p07'),
    clubId: ClubId('bordeaux-begles'),
    season: Season('2023-2024'),
  },
  {
    playerId: PlayerId('p08'),
    clubId: ClubId('bordeaux-begles'),
    season: Season('2022-2023'),
  },
  {
    playerId: PlayerId('p08'),
    clubId: ClubId('bordeaux-begles'),
    season: Season('2023-2024'),
  },
  {
    playerId: PlayerId('p09'),
    clubId: ClubId('bordeaux-begles'),
    season: Season('2022-2023'),
  },
  {
    playerId: PlayerId('p09'),
    clubId: ClubId('bordeaux-begles'),
    season: Season('2023-2024'),
  },
  {
    playerId: PlayerId('p10'),
    clubId: ClubId('bordeaux-begles'),
    season: Season('2021-2022'),
  }, // bridge Bordeaux→Racing

  // ── RC Toulon ───────────────────────────────────────────────────────────
  {
    playerId: PlayerId('p11'),
    clubId: ClubId('toulon'),
    season: Season('2022-2023'),
  },
  {
    playerId: PlayerId('p11'),
    clubId: ClubId('toulon'),
    season: Season('2023-2024'),
  },
  {
    playerId: PlayerId('p12'),
    clubId: ClubId('toulon'),
    season: Season('2022-2023'),
  },
  {
    playerId: PlayerId('p13'),
    clubId: ClubId('toulon'),
    season: Season('2023-2024'),
  },
  {
    playerId: PlayerId('p14'),
    clubId: ClubId('toulon'),
    season: Season('2023-2024'),
  }, // Fickou: Racing→Toulouse→Toulon
  {
    playerId: PlayerId('p05'),
    clubId: ClubId('toulon'),
    season: Season('2022-2023'),
  }, // bridge Toulouse→Toulon
  {
    playerId: PlayerId('p39'),
    clubId: ClubId('toulon'),
    season: Season('2021-2022'),
  }, // Guirado: Toulon→Montpellier

  // ── Aviron Bayonnais ────────────────────────────────────────────────────
  {
    playerId: PlayerId('p15'),
    clubId: ClubId('bayonne'),
    season: Season('2022-2023'),
  },
  {
    playerId: PlayerId('p15'),
    clubId: ClubId('bayonne'),
    season: Season('2023-2024'),
  },
  {
    playerId: PlayerId('p16'),
    clubId: ClubId('bayonne'),
    season: Season('2022-2023'),
  },
  {
    playerId: PlayerId('p16'),
    clubId: ClubId('bayonne'),
    season: Season('2023-2024'),
  },
  {
    playerId: PlayerId('p17'),
    clubId: ClubId('bayonne'),
    season: Season('2022-2023'),
  },
  {
    playerId: PlayerId('p18'),
    clubId: ClubId('bayonne'),
    season: Season('2023-2024'),
  },
  {
    playerId: PlayerId('p48'),
    clubId: ClubId('bayonne'),
    season: Season('2023-2024'),
  }, // bridge Lyon→Bayonne

  // ── ASM Clermont ────────────────────────────────────────────────────────
  {
    playerId: PlayerId('p19'),
    clubId: ClubId('clermont'),
    season: Season('2022-2023'),
  },
  {
    playerId: PlayerId('p19'),
    clubId: ClubId('clermont'),
    season: Season('2023-2024'),
  },
  {
    playerId: PlayerId('p20'),
    clubId: ClubId('clermont'),
    season: Season('2022-2023'),
  },
  {
    playerId: PlayerId('p21'),
    clubId: ClubId('clermont'),
    season: Season('2022-2023'),
  },
  {
    playerId: PlayerId('p21'),
    clubId: ClubId('clermont'),
    season: Season('2023-2024'),
  },
  {
    playerId: PlayerId('p22'),
    clubId: ClubId('clermont'),
    season: Season('2023-2024'),
  },
  {
    playerId: PlayerId('p23'),
    clubId: ClubId('clermont'),
    season: Season('2021-2022'),
  }, // bridge Clermont→Lyon

  // ── Castres Olympique ───────────────────────────────────────────────────
  {
    playerId: PlayerId('p24'),
    clubId: ClubId('castres'),
    season: Season('2022-2023'),
  },
  {
    playerId: PlayerId('p24'),
    clubId: ClubId('castres'),
    season: Season('2023-2024'),
  },
  {
    playerId: PlayerId('p25'),
    clubId: ClubId('castres'),
    season: Season('2022-2023'),
  },
  {
    playerId: PlayerId('p26'),
    clubId: ClubId('castres'),
    season: Season('2022-2023'),
  },
  {
    playerId: PlayerId('p26'),
    clubId: ClubId('castres'),
    season: Season('2023-2024'),
  },
  {
    playerId: PlayerId('p27'),
    clubId: ClubId('castres'),
    season: Season('2021-2022'),
  }, // bridge Castres→Lyon
  {
    playerId: PlayerId('p55'),
    clubId: ClubId('castres'),
    season: Season('2021-2022'),
  }, // Tolofua: Toulouse→Castres→Perpignan

  // ── Stade Rochelais ─────────────────────────────────────────────────────
  {
    playerId: PlayerId('p28'),
    clubId: ClubId('la-rochelle'),
    season: Season('2022-2023'),
  },
  {
    playerId: PlayerId('p28'),
    clubId: ClubId('la-rochelle'),
    season: Season('2023-2024'),
  },
  {
    playerId: PlayerId('p29'),
    clubId: ClubId('la-rochelle'),
    season: Season('2022-2023'),
  },
  {
    playerId: PlayerId('p29'),
    clubId: ClubId('la-rochelle'),
    season: Season('2023-2024'),
  },
  {
    playerId: PlayerId('p30'),
    clubId: ClubId('la-rochelle'),
    season: Season('2022-2023'),
  },
  {
    playerId: PlayerId('p30'),
    clubId: ClubId('la-rochelle'),
    season: Season('2023-2024'),
  },
  {
    playerId: PlayerId('p31'),
    clubId: ClubId('la-rochelle'),
    season: Season('2022-2023'),
  }, // Hastoy: Pau→La Rochelle
  {
    playerId: PlayerId('p31'),
    clubId: ClubId('la-rochelle'),
    season: Season('2023-2024'),
  },
  {
    playerId: PlayerId('p32'),
    clubId: ClubId('la-rochelle'),
    season: Season('2023-2024'),
  },

  // ── Section Paloise ─────────────────────────────────────────────────────
  {
    playerId: PlayerId('p33'),
    clubId: ClubId('pau'),
    season: Season('2022-2023'),
  },
  {
    playerId: PlayerId('p33'),
    clubId: ClubId('pau'),
    season: Season('2023-2024'),
  },
  {
    playerId: PlayerId('p34'),
    clubId: ClubId('pau'),
    season: Season('2022-2023'),
  },
  {
    playerId: PlayerId('p35'),
    clubId: ClubId('pau'),
    season: Season('2022-2023'),
  },
  {
    playerId: PlayerId('p35'),
    clubId: ClubId('pau'),
    season: Season('2023-2024'),
  },
  {
    playerId: PlayerId('p36'),
    clubId: ClubId('pau'),
    season: Season('2023-2024'),
  },
  {
    playerId: PlayerId('p31'),
    clubId: ClubId('pau'),
    season: Season('2021-2022'),
  }, // Hastoy à Pau avant La Rochelle

  // ── Montpellier ─────────────────────────────────────────────────────────
  {
    playerId: PlayerId('p37'),
    clubId: ClubId('montpellier'),
    season: Season('2022-2023'),
  },
  {
    playerId: PlayerId('p37'),
    clubId: ClubId('montpellier'),
    season: Season('2023-2024'),
  },
  {
    playerId: PlayerId('p38'),
    clubId: ClubId('montpellier'),
    season: Season('2022-2023'),
  },
  {
    playerId: PlayerId('p38'),
    clubId: ClubId('montpellier'),
    season: Season('2023-2024'),
  },
  {
    playerId: PlayerId('p39'),
    clubId: ClubId('montpellier'),
    season: Season('2022-2023'),
  }, // Guirado: Toulon→Montpellier
  {
    playerId: PlayerId('p40'),
    clubId: ClubId('montpellier'),
    season: Season('2022-2023'),
  },
  {
    playerId: PlayerId('p40'),
    clubId: ClubId('montpellier'),
    season: Season('2023-2024'),
  },

  // ── Racing 92 ───────────────────────────────────────────────────────────
  {
    playerId: PlayerId('p41'),
    clubId: ClubId('racing-92'),
    season: Season('2022-2023'),
  },
  {
    playerId: PlayerId('p41'),
    clubId: ClubId('racing-92'),
    season: Season('2023-2024'),
  },
  {
    playerId: PlayerId('p42'),
    clubId: ClubId('racing-92'),
    season: Season('2021-2022'),
  }, // Teddy Thomas: Racing→Stade Français
  {
    playerId: PlayerId('p43'),
    clubId: ClubId('racing-92'),
    season: Season('2022-2023'),
  },
  {
    playerId: PlayerId('p43'),
    clubId: ClubId('racing-92'),
    season: Season('2023-2024'),
  },
  {
    playerId: PlayerId('p44'),
    clubId: ClubId('racing-92'),
    season: Season('2023-2024'),
  },
  {
    playerId: PlayerId('p10'),
    clubId: ClubId('racing-92'),
    season: Season('2022-2023'),
  }, // bridge Bordeaux→Racing
  {
    playerId: PlayerId('p14'),
    clubId: ClubId('racing-92'),
    season: Season('2021-2022'),
  }, // Fickou à Racing avant Toulouse

  // ── LOU Rugby ───────────────────────────────────────────────────────────
  {
    playerId: PlayerId('p45'),
    clubId: ClubId('lyon'),
    season: Season('2022-2023'),
  },
  {
    playerId: PlayerId('p45'),
    clubId: ClubId('lyon'),
    season: Season('2023-2024'),
  },
  {
    playerId: PlayerId('p46'),
    clubId: ClubId('lyon'),
    season: Season('2022-2023'),
  },
  {
    playerId: PlayerId('p46'),
    clubId: ClubId('lyon'),
    season: Season('2023-2024'),
  },
  {
    playerId: PlayerId('p47'),
    clubId: ClubId('lyon'),
    season: Season('2022-2023'),
  },
  {
    playerId: PlayerId('p48'),
    clubId: ClubId('lyon'),
    season: Season('2021-2022'),
  }, // Berdeu: Lyon→Bayonne
  {
    playerId: PlayerId('p48'),
    clubId: ClubId('lyon'),
    season: Season('2022-2023'),
  },
  {
    playerId: PlayerId('p23'),
    clubId: ClubId('lyon'),
    season: Season('2022-2023'),
  }, // bridge Clermont→Lyon
  {
    playerId: PlayerId('p27'),
    clubId: ClubId('lyon'),
    season: Season('2022-2023'),
  }, // bridge Castres→Lyon

  // ── Stade Français ──────────────────────────────────────────────────────
  {
    playerId: PlayerId('p49'),
    clubId: ClubId('stade-francais'),
    season: Season('2022-2023'),
  },
  {
    playerId: PlayerId('p49'),
    clubId: ClubId('stade-francais'),
    season: Season('2023-2024'),
  },
  {
    playerId: PlayerId('p50'),
    clubId: ClubId('stade-francais'),
    season: Season('2022-2023'),
  },
  {
    playerId: PlayerId('p50'),
    clubId: ClubId('stade-francais'),
    season: Season('2023-2024'),
  },
  {
    playerId: PlayerId('p51'),
    clubId: ClubId('stade-francais'),
    season: Season('2022-2023'),
  },
  {
    playerId: PlayerId('p52'),
    clubId: ClubId('stade-francais'),
    season: Season('2023-2024'),
  },
  {
    playerId: PlayerId('p42'),
    clubId: ClubId('stade-francais'),
    season: Season('2022-2023'),
  }, // Teddy Thomas: Racing→Stade Français

  // ── USAP Perpignan ──────────────────────────────────────────────────────
  {
    playerId: PlayerId('p53'),
    clubId: ClubId('perpignan'),
    season: Season('2022-2023'),
  },
  {
    playerId: PlayerId('p53'),
    clubId: ClubId('perpignan'),
    season: Season('2023-2024'),
  },
  {
    playerId: PlayerId('p54'),
    clubId: ClubId('perpignan'),
    season: Season('2022-2023'),
  },
  {
    playerId: PlayerId('p54'),
    clubId: ClubId('perpignan'),
    season: Season('2023-2024'),
  },
  {
    playerId: PlayerId('p55'),
    clubId: ClubId('perpignan'),
    season: Season('2022-2023'),
  }, // Tolofua: Toulouse→Castres→Perpignan
  {
    playerId: PlayerId('p55'),
    clubId: ClubId('perpignan'),
    season: Season('2023-2024'),
  },

  // ── RC Vannes ───────────────────────────────────────────────────────────
  {
    playerId: PlayerId('p56'),
    clubId: ClubId('vannes'),
    season: Season('2023-2024'),
  },
  {
    playerId: PlayerId('p57'),
    clubId: ClubId('vannes'),
    season: Season('2023-2024'),
  },
  {
    playerId: PlayerId('p58'),
    clubId: ClubId('vannes'),
    season: Season('2023-2024'),
  },
];

/*
  Chemins de connexion illustratifs :

  Direct (length 1):
    p01 ↔ p02  (Toulouse 2022-23)
    p06 ↔ p07  (Bordeaux 2022-23)

  Length 2:
    p01 → p04 (Toulouse 2022-23) → p04 lié à p02/p03
    p14 (Fickou) : Racing 2021-22 → Toulon 2023-24
      p41 → p14 → p13  (Racing→Toulon)

  Length 3:
    p01 → p05 (Toulouse 2021-22, bridge) → p05 (Toulon 2022-23) → p11
    p06 → p10 (Bordeaux 2021-22) → p10 (Racing 2022-23) → p43

  Length 4+:
    p01 → p05 → p11 (Toulon) → p39 (Toulon 2021-22) → p37 (Montpellier)
    p45 → p27 (Lyon 2022-23) → p25 (Castres 2022-23) → p24

  Cross-club chains couverts :
    Toulouse ↔ Toulon (via p05)
    Toulon ↔ Montpellier (via p39 Guirado)
    Racing ↔ Bordeaux (via p10 Ben Lam)
    Racing ↔ Stade Français (via p42 Teddy Thomas)
    Clermont ↔ Lyon (via p23 Moala)
    Castres ↔ Lyon (via p27 Barassi)
    Lyon ↔ Bayonne (via p48 Berdeu)
    Pau ↔ La Rochelle (via p31 Hastoy)
    Toulouse ↔ Castres ↔ Perpignan (via p55 Tolofua)
    Toulouse ↔ Perpignan (via p53 Jaminet)
    Racing ↔ Toulon (via p14 Fickou)
*/
