export const BREEDS = [
  // Owczarki
  "owczarek_niemiecki",
  "owczarek_belgijski",
  "owczarek_podhalanski",
  "owczarek_szetlandzki",

  // Popularne duże
  "labrador",
  "golden_retriever",
  "husky",
  "malamut",
  "bernardyn",
  "nowofundland",
  "dog_niemiecki",
  "rottweiler",
  "doberman",
  "bokser",
  "amstaf",
  "pitbull",
  "cane_corso",
  "akita",

  // Popularne średnie
  "border_collie",
  "beagle",
  "cocker_spaniel",
  "springer_spaniel",
  "seter",
  "pointer",
  "buldog",
  "basenji",
  "shiba",
  "chow_chow",
  "shar_pei",
  "dalmatynczyk",

  // Popularne małe
  "jamnik",
  "jack_russell",
  "fox_terrier",
  "west_highland_terrier",
  "yorkshire_terrier",
  "maltanczyk",
  "shih_tzu",
  "pekinczyk",
  "mops",
  "buldog_francuski",
  "chihuahua",
  "pomeranian",
  "cavalier",
  "bichon",
  "pudel",
  "miniatura_schnauzer",

  // Polskie/lokalne
  "gonczy_polski",
  "ogar_polski",
  "chart_polski",

  // Catch-all
  "kundelek",
  "mieszaniec",
  "nieznana",
] as const

export type Breed = (typeof BREEDS)[number]
