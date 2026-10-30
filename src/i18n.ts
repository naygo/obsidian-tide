// All UI text lives here. Only pt-BR for now; another language is another table with the same keys.
const ptBR = {
  'command.nextState': 'Avançar estado da tarefa',
  'command.prevState': 'Voltar estado da tarefa',
  'command.priorityUp': 'Aumentar prioridade da tarefa',
  'command.priorityDown': 'Diminuir prioridade da tarefa',
  // weekday abbreviations written inside org dates, Sunday first
  'weekday.0': 'dom',
  'weekday.1': 'seg',
  'weekday.2': 'ter',
  'weekday.3': 'qua',
  'weekday.4': 'qui',
  'weekday.5': 'sex',
  'weekday.6': 'sáb',
}

export type MessageKey = keyof typeof ptBR

export function t(key: MessageKey): string {
  return ptBR[key]
}
