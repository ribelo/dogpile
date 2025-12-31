#!/usr/bin/env bun

import { $ } from "bun"

const CSV_PATH = "docs/shelters_todo.csv"

const WOJEWÓDZTWO_MAPPING: Record<string, string[]> = {
  "Mazowieckie": [
    "Schronisko na Paluchu",
    "Fundacja Azylu pod Psim Aniołem",
    "Ochota na Kota",
    "Tylko Przyjaciele Zwierząt",
    "Schronisko w Celestynowie",
    "Schronisko w Korabiewicach",
    "Schronisko w Milanówku",
    "Schronisko w Nowym Dworze Mazowieckim",
    "Fundacja dla Szczeniąt Judyta",
    "Schronisko w Płocku",
    "Stowarzyszenie Płock Przyjazny Psom",
    "Stowarzyszenie Pomiechowskie Bezdomniaki",
    "Schronisko Bąkówka",
    "Schronisko w Pawłowie",
    "Schronisko w Radomiu",
    "Schronisko w Żyrardowie",
    "Fundacja Zwierząt Skrzywdzonych Zielony Pies",
    "Stowarzyszenie Bezdomne Serduszka",
    "Fundacja Hakuna Matata",
    "Fundacja Złap Dom",
    "Fundacja Trop Warszawa",
    "Fundacja Opieki i Rozwoju Humanitares",
    "Interwencyjne Centrum Pomocy Kotom",
    "Towarzystwo Pomocy Kotom ProFelis",
    "Bezdomniaki",
  ],
  "Wielkopolskie": [
    "Schronisko dla Zwierząt w Poznaniu",
    "Schronisko w Skałowie",
    "Przytulisko u Wandy",
    "Fundacja Dr Lucy",
    "Schronisko w Gnieźnie",
    "Schronisko w Krotoszynie",
    "Schronisko w Koninie",
    "Schronisko w Pile Miluszków",
    "Schronisko w Jędrzejewie",
    "Schronisko w Ostrowie Wielkopolskim",
    "Schronisko we Wrześni",
    "OTOZ Animals Schronisko w Sompolnie",
    "Przystań dla Zwierząt",
    "Schronisko w Lesznie Henrykowo",
    "Przytulisko w Wolsztynie",
    "Fundacja Ochrony Zwierząt AnimaLove",
    "Fundacja Sterczące Uszy",
    "Fundacja Pańska Łaska",
    "Ja Pacze Sercem",
    "Włochata Chata",
    "Fundacja Benek",
  ],
  "Śląskie": [
    "Schronisko w Katowicach",
    "Schronisko Psitulmnie w Zabrzu",
    "Schronisko w Chorzowie",
    "Schronisko w Częstochowie",
    "Schronisko w Bytomiu",
    "Schronisko w Sosnowcu",
    "Schronisko w Tychach",
    "Schronisko w Bielsku-Białej",
    "Schronisko w Rybniku",
    "Fundacja Szara Przystań",
    "Stowarzyszenie DoberMania",
    "Stowarzyszenie Kocimiętka",
    "Rzecz Psów Północy OKIEM WILKA",
    "Fundacja Mam kota na punkcie ps",
    "Fundacja Cieszyński Zwierzogród",
  ],
  "Małopolskie": [
    "Schronisko w Krakowie",
    "Schronisko w Nowym Targu",
    "Schronisko w Oświęcimiu",
    "Schronisko w Olkuszu",
    "Azyl w Tarnowie",
    "Fundacja La Fauna",
    "Fundacja Ostoja Cztery Łapy",
    "Małopolska Org. na Rzecz Natury MORN",
    "Schronisko w Chełmku",
    "Schronisko Psie Pole",
    "Stowarzyszenie Przytul Sierściucha",
    "Fundacja Lead Group",
    "Koci Patrol",
  ],
  "Pomorskie": [
    "Schronisko Promyk w Gdańsku",
    "Schronisko w Gdyni Ciapkowo",
    "Schronisko w Tczewie",
    "Schronisko w Dąbrówce",
    "Schronisko w Słupsku",
    "Schronisko w Starogardzie Gdańskim",
    "Schronisko w Chojnicach Przytulisko",
    "Schronisko w Elblągu",
    "Stacja Morska w Helu",
  ],
  "Zachodniopomorskie": [
    "Schronisko w Szczecinie",
    "Schronisko w Kołobrzegu",
    "Schronisko w Świnoujściu",
    "Schronisko w Kiczarowie",
    "Schronisko w Choszcznie",
    "Schronisko w Golczewie",
    "Schronisko w Dobrej",
    "Stowarzyszenie Trzymaj Się Kocie!",
    "Koty spod Bloku",
  ],
  "Łódzkie": [
    "Schronisko w Łodzi",
    "Schronisko w Wojtyszkach",
    "Schronisko Medor w Zgierzu",
    "Schronisko w Pabianicach",
    "Przytulisko w Głownie",
    "Schronisko w Bełchatowie",
    "Schronisko w Tomaszowie Mazowieckim",
    "Schronisko w Piotrkowie Trybunalskim",
    "Schronisko w Czartkach",
    "Schronisko w Jasionce",
    "Schronisko w Rytlowie",
    "Fundacja Tabby Burasy i Spółka",
    "Fundacja Koty na Zakręcie",
    "Stowarzyszenie Amstaffy Niczyje",
  ],
  "Lubelskie": [
    "Schronisko w Lublinie",
    "Schronisko w Nowodworze",
    "Schronisko w Puławach",
    "Schronisko w Zamościu",
    "Schronisko w Chełmie",
    "Schronisko w Krzesimowie",
  ],
  "Podlaskie": [
    "Schronisko w Białymstoku",
    "Schronisko w Suwałkach",
    "Schronisko Cyganowo",
    "Schronisko w Łomży",
    "Azyl w Mikołajewie",
  ],
  "Dolnośląskie": [
    "Schronisko we Wrocławiu",
    "Schronisko w Wałbrzychu",
    "Schronisko w Jeleniej Górze",
    "Schronisko w Dzierżoniowie Azyl",
    "Schronisko w Dłużynie Górnej",
    "Schronisko w Legnicy",
    "Schronisko w Świdnicy",
    "Fundacja Tara Schronisko dla Koni",
    "Fundacja Centaurus Folwark",
    "Dom Tymczasowy Łatka na Łapce",
    "Fundacja Kubusia Puchatka",
    "Stowarzyszenie Zwierzaki Bezdomniaki",
  ],
  "Warmińsko-Mazurskie": [
    "Schronisko w Olsztynie",
    "Schronisko w Tomarynach",
    "Schronisko w Pudwągach",
    "Schronisko w Zbożnem",
    "Schronisko w Szczytnie",
    "Schronisko w Bagienicach Małych",
    "Ośrodek Rehabilitacji Ptaków Drapieżnych",
    "Fundacja Albatros",
  ],
  "Lubuskie": [
    "Schronisko w Zielonej Górze",
    "Schronisko Azorki w Gorzowie Wlkp.",
    "Schronisko w Żarach",
  ],
  "Opolskie": [
    "Schronisko w Opolu",
    "Schronisko w Kędzierzynie-Koźlu",
    "Schronisko w Nysie",
    "Stowarzyszenie W ogrodzie Viadrusa",
  ],
  "Świętokrzyskie": [
    "Schronisko w Dyminach",
  ],
  "Kujawsko-Pomorskie": [
    "Schronisko w Bydgoszczy",
    "Schronisko w Toruniu",
    "Fundacja Hospicjum dla Kotów Bezdomnych",
    "Schronisko we Włocławku",
  ],
  "Podkarpackie": [
    "Schronisko w Rzeszowie Kundelek",
    "Schronisko w Mielcu",
    "Schronisko w Orzechowcach",
  ],
}

interface ShelterRow {
  name: string
  url: string
  done: string
}

async function parseCSV(): Promise<ShelterRow[]> {
  const content = await Bun.file(CSV_PATH).text()
  const lines = content.trim().split("\n")
  const rows: ShelterRow[] = []

  for (let i = 1; i < lines.length; i++) {
    const [name, url, done] = lines[i].split(",")
    if (name && url) {
      rows.push({ name: name.trim(), url: url.trim(), done: done?.trim() || "false" })
    }
  }
  return rows
}

function findWojewództwo(shelterName: string): string {
  for (const [woj, shelters] of Object.entries(WOJEWÓDZTWO_MAPPING)) {
    if (shelters.includes(shelterName)) {
      return woj
    }
  }
  return "Inne"
}

async function createEpic(title: string): Promise<string | null> {
  try {
    const result = await $`bd create ${title} -t epic -p 2 --json`.text()
    const data = JSON.parse(result)
    return data.id || null
  } catch (e) {
    console.error(`Failed to create epic: ${title}`, e)
    return null
  }
}

async function createTask(title: string, parentId: string, url: string): Promise<string | null> {
  try {
    const description = `Create scraper adapter for ${title}\nURL: ${url}`
    const result = await $`bd create ${title} -t task -p 3 --parent ${parentId} --json`.text()
    const data = JSON.parse(result)
    return data.id || null
  } catch (e) {
    console.error(`Failed to create task: ${title}`, e)
    return null
  }
}

async function main() {
  console.log("Parsing CSV...")
  const shelters = await parseCSV()

  const scrapableShelters = shelters.filter(s =>
    s.url &&
    !s.url.includes("facebook.com") &&
    s.done !== "true"
  )

  console.log(`Found ${scrapableShelters.length} scrapable shelters`)

  console.log("Creating main epic...")
  const mainEpicId = await createEpic("Shelter Scrapers Implementation")
  if (!mainEpicId) {
    console.error("Failed to create main epic")
    process.exit(1)
  }
  console.log(`Created main epic: ${mainEpicId}`)

  const wojGroups = new Map<string, ShelterRow[]>()
  for (const shelter of scrapableShelters) {
    const woj = findWojewództwo(shelter.name)
    if (!wojGroups.has(woj)) {
      wojGroups.set(woj, [])
    }
    wojGroups.get(woj)!.push(shelter)
  }

  for (const [woj, shelterList] of wojGroups) {
    console.log(`\nCreating epic for ${woj} (${shelterList.length} shelters)...`)
    const wojEpicId = await createEpic(`[${woj}] Shelter Scrapers`)
    if (!wojEpicId) {
      console.error(`Failed to create epic for ${woj}`)
      continue
    }

    await $`bd dep add ${wojEpicId} ${mainEpicId} -t related --json`.quiet()

    for (const shelter of shelterList) {
      const taskId = await createTask(
        `Scraper: ${shelter.name}`,
        wojEpicId,
        shelter.url
      )
      if (taskId) {
        console.log(`  Created: ${taskId} - ${shelter.name}`)
      }
      await Bun.sleep(50)
    }
  }

  console.log("\nDone! Running bd sync...")
  await $`bd sync`.quiet()
  console.log("All tasks created and synced.")
}

main().catch(console.error)
