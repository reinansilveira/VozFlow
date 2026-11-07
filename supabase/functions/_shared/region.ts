// Estado brasileiro a partir do DDD, já com a preposição ("de Sergipe", "da Bahia"), para os avisos
// anônimos de atividade do site.
const statesByDdd: Array<[string, number[]]> = [
  ['de São Paulo', [11, 12, 13, 14, 15, 16, 17, 18, 19]],
  ['do Rio de Janeiro', [21, 22, 24]],
  ['do Espírito Santo', [27, 28]],
  ['de Minas Gerais', [31, 32, 33, 34, 35, 37, 38]],
  ['do Paraná', [41, 42, 43, 44, 45, 46]],
  ['de Santa Catarina', [47, 48, 49]],
  ['do Rio Grande do Sul', [51, 53, 54, 55]],
  ['do Distrito Federal', [61]],
  ['de Goiás', [62, 64]],
  ['do Tocantins', [63]],
  ['de Mato Grosso', [65, 66]],
  ['de Mato Grosso do Sul', [67]],
  ['do Acre', [68]],
  ['de Rondônia', [69]],
  ['da Bahia', [71, 73, 74, 75, 77]],
  ['de Sergipe', [79]],
  ['de Pernambuco', [81, 87]],
  ['de Alagoas', [82]],
  ['da Paraíba', [83]],
  ['do Rio Grande do Norte', [84]],
  ['do Ceará', [85, 88]],
  ['do Piauí', [86, 89]],
  ['do Pará', [91, 93, 94]],
  ['do Amazonas', [92, 97]],
  ['de Roraima', [95]],
  ['do Amapá', [96]],
  ['do Maranhão', [98, 99]],
];

const stateByDdd = new Map(statesByDdd.flatMap(([state, ddds]) => ddds.map((ddd) => [ddd, state] as const)));

export const regionFromDdd = (ddd: string | null | undefined): string | null =>
  ddd && /^\d{2}$/.test(ddd) ? stateByDdd.get(Number(ddd)) ?? null : null;
