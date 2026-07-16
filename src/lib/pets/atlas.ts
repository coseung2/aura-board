import type { PetElement, PetLineageDefinition } from './catalog';


const xmlEscape = (value: string): string => value
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&apos;')

const motifForEgg = (lineage: PetLineageDefinition): string => {
  const [primary, secondary] = lineage.egg.palette
  switch (lineage.egg.motif) {
    case 'leaf': return `<path d="M-25 3Q-8-24 13-8Q5 15-25 3Z" fill="${secondary}"/><path d="M-17 0L7-8" stroke="${primary}" stroke-width="5" stroke-linecap="round"/>`
    case 'ripple': return `<path d="M-31 2Q-16-12 0 2T31 2" fill="none" stroke="${secondary}" stroke-width="8" stroke-linecap="round"/><path d="M-21 22Q0 7 21 22" fill="none" stroke="${secondary}" stroke-width="6" stroke-linecap="round"/>`
    case 'coral': return `<path d="M0 26V-21M0-8L-22-28M0-1L22-24M-15-20L-16-37M17-18L27-32" fill="none" stroke="${secondary}" stroke-width="8" stroke-linecap="round"/>`
    case 'crack': return `<path d="M-7-37L8-13L-4 3L14 28" fill="none" stroke="${secondary}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>`
    case 'cloud': return `<path d="M-31 15Q-37-4-18-7Q-13-29 7-18Q25-23 28-4Q42 2 31 16Z" fill="${secondary}" opacity=".9"/>`
    case 'moon': return `<path d="M14-28A35 35 0 1 0 24 29A28 28 0 1 1 14-28Z" fill="${secondary}"/>`
    case 'sun': return `<circle r="24" fill="${secondary}"/><path d="M0-43V-32M0 32V43M-43 0H-32M32 0H43M-30-30L-22-22M22 22L30 30M30-30L22-22M-22 22L-30 30" stroke="${secondary}" stroke-width="7" stroke-linecap="round"/>`
    default: return `<circle r="24" fill="${secondary}"/>`
  }
}

const appendagesForElement = (
  element: PetElement,
  primary: string,
  secondary: string,
  accent: string,
  signaturePower: number,
): string => {
  switch (element) {
    case 'earth':
      return `<path d="M-54-45Q-82-85-49-101Q-18-76-30-38Z" fill="${secondary}" stroke="${primary}" stroke-width="7"/><path d="M54-45Q82-85 49-101Q18-76 30-38Z" fill="${secondary}" stroke="${primary}" stroke-width="7"/><path d="M-9-82Q0-116 18-94Q14-76-9-82Z" fill="${accent}" stroke="${primary}" stroke-width="5"/>${signaturePower ? `<path d="M-80 69Q-62 42-43 70M-10 78Q0 45 12 78M45 70Q62 43 82 70" fill="none" stroke="${secondary}" stroke-width="8" stroke-linecap="round"/>` : ''}`
    case 'river':
      return `<path d="M-51-40L-87-66L-78-20Z" fill="${secondary}" stroke="${primary}" stroke-width="7"/><path d="M51-40L87-66L78-20Z" fill="${secondary}" stroke="${primary}" stroke-width="7"/><path d="M63 42Q111 24 102 72Q84 91 62 65" fill="${secondary}" stroke="${primary}" stroke-width="7"/>${signaturePower ? `<path d="M-105 65Q-78 42-51 65T3 65T57 65T111 65" fill="none" stroke="${accent}" stroke-width="9" stroke-linecap="round" opacity=".9"/>` : ''}`
    case 'sea':
      return `<path d="M-45-52V-91M-45-79L-64-98M-45-72L-27-97M45-52V-91M45-79L64-98M45-72L27-97" fill="none" stroke="${accent}" stroke-width="9" stroke-linecap="round"/><path d="M-59 24Q-99 38-83 70Q-60 70-49 48M59 24Q99 38 83 70Q60 70 49 48" fill="${secondary}" stroke="${primary}" stroke-width="7"/>${signaturePower ? `<circle cx="-91" cy="-8" r="10" fill="none" stroke="${accent}" stroke-width="5"/><circle cx="93" cy="-32" r="7" fill="none" stroke="${accent}" stroke-width="4"/><circle cx="103" cy="11" r="13" fill="none" stroke="${accent}" stroke-width="5"/>` : ''}`
    case 'volcano':
      return `<path d="M-48-55L-30-104L-5-61Z" fill="#36323a" stroke="${primary}" stroke-width="7"/><path d="M48-55L30-104L5-61Z" fill="#36323a" stroke="${primary}" stroke-width="7"/><path d="M62 43Q104 49 93 84Q75 102 59 70" fill="#3a3034" stroke="${primary}" stroke-width="7"/><path d="M89 75Q116 52 111 89Q100 109 82 95Q69 84 89 75Z" fill="${accent}" stroke="${secondary}" stroke-width="5"/>${signaturePower ? `<path d="M-99 60L-83 35L-68 60L-51 26L-35 60" fill="${accent}" opacity=".8"/>` : ''}`
    case 'sky':
      return `<path d="M-51-43Q-91-78-106-28Q-91 20-51 13Q-74-2-51-43Z" fill="${accent}" stroke="${primary}" stroke-width="7"/><path d="M51-43Q91-78 106-28Q91 20 51 13Q74-2 51-43Z" fill="${accent}" stroke="${primary}" stroke-width="7"/><path d="M57 55Q93 39 101 68Q91 91 61 79" fill="${secondary}" stroke="${primary}" stroke-width="7"/>${signaturePower ? `<path d="M-99 79Q-72 52-45 79Q-19 47 10 78Q39 52 66 79Q88 56 106 79" fill="${accent}" opacity=".84"/>` : ''}`
    case 'dark':
      return `<path d="M-47-47L-74-98L-17-72Z" fill="${secondary}" stroke="${primary}" stroke-width="7"/><path d="M47-47L74-98L17-72Z" fill="${secondary}" stroke="${primary}" stroke-width="7"/><path d="M-55-1Q-103-35-103 18Q-82 47-52 32M55-1Q103-35 103 18Q82 47 52 32" fill="${primary}" stroke="${secondary}" stroke-width="6"/>${signaturePower ? `<ellipse cy="78" rx="104" ry="26" fill="${primary}" opacity=".45"/><circle cx="-88" cy="-62" r="6" fill="${accent}"/><circle cx="94" cy="-48" r="8" fill="${accent}"/>` : ''}`
    case 'light':
      return `<path d="M-47-48L-70-96L-16-72Z" fill="${secondary}" stroke="${primary}" stroke-width="7"/><path d="M47-48L70-96L16-72Z" fill="${secondary}" stroke="${primary}" stroke-width="7"/><circle cy="-94" r="34" fill="none" stroke="${accent}" stroke-width="8" opacity=".8"/><path d="M63 48L96 29L87 62L113 80L79 87L65 116L50 84L18 79L44 61L36 29Z" fill="${secondary}" stroke="${primary}" stroke-width="6"/>${signaturePower ? `<path d="M-104-7H-78M104-7H78M-76-76L-58-58M76-76L58-58M0-126V-105" stroke="${accent}" stroke-width="8" stroke-linecap="round"/>` : ''}`
  }
}

const signatureParticles = (element: PetElement, accent: string, frame: number): string => {
  if (frame === 0) return `<circle cx="-84" cy="-32" r="6" fill="${accent}" opacity=".7"/><circle cx="84" cy="-22" r="5" fill="${accent}" opacity=".7"/>`
  const count = frame === 1 ? 5 : 8
  return Array.from({ length: count }, (_, index) => {
    const angle = (-150 + index * (300 / Math.max(1, count - 1))) * Math.PI / 180
    const radius = frame === 1 ? 103 : 124
    const x = Math.round(Math.cos(angle) * radius)
    const y = Math.round(Math.sin(angle) * radius - 5)
    const shape = element === 'light' ? 'polygon' : element === 'volcano' ? 'path' : 'circle'
    if (shape === 'polygon') return `<path d="M${x} ${y - 9}L${x + 3} ${y - 3}L${x + 9} ${y}L${x + 3} ${y + 3}L${x} ${y + 9}L${x - 3} ${y + 3}L${x - 9} ${y}L${x - 3} ${y - 3}Z" fill="${accent}"/>`
    if (shape === 'path') return `<path d="M${x} ${y + 8}Q${x - 10} ${y - 4} ${x} ${y - 14}Q${x + 11} ${y - 4} ${x} ${y + 8}Z" fill="${accent}"/>`
    return `<circle cx="${x}" cy="${y}" r="${frame === 1 ? 7 : 9}" fill="${accent}" opacity=".86"/>`
  }).join('')
}

const renderEggCell = (lineage: PetLineageDefinition, column: number): string => {
  const x = column * 256 + 128
  const [primary, secondary, accent] = lineage.egg.palette
  const tilt = [-5, 0, 5][column]
  const crack = column === 2 ? `<path d="M-16-42L-3-20L-16-2L2 18" fill="none" stroke="${primary}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>` : ''
  return `<g transform="translate(${x} 128) rotate(${tilt})"><ellipse cy="84" rx="57" ry="15" fill="#000" opacity=".16"/><path d="M0-91C55-91 83-36 73 22C64 75 34 98 0 98S-64 75-73 22C-83-36-55-91 0-91Z" fill="${accent}" stroke="${primary}" stroke-width="9"/><path d="M-61 24Q0 56 61 24" fill="none" stroke="${secondary}" stroke-width="14" opacity=".55"/>${motifForEgg(lineage)}${crack}</g>`
}

const renderCreatureCell = (
  lineage: PetLineageDefinition,
  stageIndex: number,
  actionIndex: number,
  frameIndex: number,
): string => {
  const row = 1 + stageIndex * 3 + actionIndex
  const cx = frameIndex * 256 + 128
  const cy = row * 256 + 132
  const [primary, secondary, accent] = lineage.stages[stageIndex].palette
  const scale = [0.72, 0.88, 1.02][stageIndex]
  const lazy = actionIndex === 1
  const signature = actionIndex === 2
  const bob = actionIndex === 0 ? [2, -4, 1][frameIndex] : lazy ? [8, 12, 16][frameIndex] : [5, -2, 2][frameIndex]
  const rotate = actionIndex === 0 && frameIndex === 2 ? 5 : lazy && frameIndex === 1 ? -4 : 0
  const blink = (actionIndex === 0 && frameIndex === 1) || (lazy && frameIndex === 2)
  const yawn = lazy && frameIndex === 1
  const signaturePower = signature ? frameIndex + 1 : 0
  const eyes = blink
    ? `<path d="M-34-13Q-23-5-12-13M12-13Q23-5 34-13" fill="none" stroke="#1b2230" stroke-width="7" stroke-linecap="round"/>`
    : `<ellipse cx="-23" cy="-14" rx="8" ry="12" fill="#1b2230"/><ellipse cx="23" cy="-14" rx="8" ry="12" fill="#1b2230"/><circle cx="-20" cy="-18" r="2.5" fill="#fff"/><circle cx="26" cy="-18" r="2.5" fill="#fff"/>`
  const mouth = yawn
    ? `<ellipse cy="15" rx="13" ry="17" fill="#4a2431"/><ellipse cy="20" rx="8" ry="6" fill="#ef8e9e"/>`
    : signature && frameIndex === 1
      ? `<path d="M-12 11Q0 26 12 11" fill="#4a2431" stroke="#1b2230" stroke-width="4" stroke-linejoin="round"/>`
      : `<path d="M-10 10Q0 18 10 10" fill="none" stroke="#1b2230" stroke-width="4" stroke-linecap="round"/>`
  const zzz = lazy && frameIndex === 2 ? `<text x="74" y="-62" fill="${accent}" font-size="28" font-family="Arial, sans-serif" font-weight="700">Z</text><text x="95" y="-86" fill="${accent}" font-size="20" font-family="Arial, sans-serif" font-weight="700">Z</text>` : ''
  const bodyHeight = 112 + stageIndex * 8
  const bodyWidth = 122 + stageIndex * 12
  return `<g transform="translate(${cx} ${cy + bob})"><ellipse cy="83" rx="${76 + stageIndex * 8}" ry="17" fill="#000" opacity=".17"/>${signature ? signatureParticles(lineage.element, accent, frameIndex) : ''}<g transform="rotate(${rotate}) scale(${scale})">${appendagesForElement(lineage.element, primary, secondary, accent, signaturePower)}<ellipse cy="12" rx="${bodyWidth / 2}" ry="${bodyHeight / 2}" fill="${primary}" stroke="#172033" stroke-width="8"/><ellipse cy="31" rx="${bodyWidth / 3.25}" ry="${bodyHeight / 3.1}" fill="${accent}" opacity=".78"/><circle cy="-33" r="64" fill="${secondary}" stroke="#172033" stroke-width="8"/>${eyes}${mouth}<ellipse cx="-36" cy="14" rx="10" ry="6" fill="${accent}" opacity=".55"/><ellipse cx="36" cy="14" rx="10" ry="6" fill="${accent}" opacity=".55"/><path d="M-42 58Q-54 78-31 81M42 58Q54 78 31 81" fill="none" stroke="#172033" stroke-width="9" stroke-linecap="round"/>${zzz}</g></g>`
}

export const createPetAtlasSvg = (lineage: PetLineageDefinition): string => {
  const title = xmlEscape(`${lineage.elementLabel} ${lineage.id} egg and three-stage behavior atlas`)
  const eggCells = [0, 1, 2].map((column) => renderEggCell(lineage, column)).join('')
  const creatureCells = lineage.stages.flatMap((_, stageIndex) => (
    [0, 1, 2].flatMap((actionIndex) => [0, 1, 2].map((frameIndex) => (
      renderCreatureCell(lineage, stageIndex, actionIndex, frameIndex)
    )))
  )).join('')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="768" height="2560" viewBox="0 0 768 2560" role="img" aria-label="${title}">\n<title>${title}</title>\n${eggCells}${creatureCells}\n</svg>\n`
}

const DATA_URL_CACHE = new Map<string, string>();

export function getPetAtlasDataUrl(lineage: PetLineageDefinition): string {
  const cached = DATA_URL_CACHE.get(lineage.id);
  if (cached) return cached;
  const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(createPetAtlasSvg(lineage))}`;
  DATA_URL_CACHE.set(lineage.id, dataUrl);
  return dataUrl;
}
