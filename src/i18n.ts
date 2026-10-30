// All UI text lives here. Only pt-BR for now; another language is another table with the same keys.
const ptBR = {
  'command.nextState': 'Avançar estado da tarefa',
  'command.prevState': 'Voltar estado da tarefa',
  'command.priorityUp': 'Aumentar prioridade da tarefa',
  'command.priorityDown': 'Diminuir prioridade da tarefa',
  'command.newList': 'Nova lista',
  'command.openWeek': 'Abrir esta semana',
  'command.openMonth': 'Abrir este mês',
  'command.openYear': 'Abrir este ano',
  'command.moveTo': 'Mover para…',
  'move.placeholder': 'Hoje, uma lista ou uma data: 2026-11-03, 2026-W45, 2026-11, 2026',
  'move.today': 'Hoje',
  'move.tomorrow': 'Amanhã',
  'move.week': 'Esta semana',
  'move.month': 'Este mês',
  'move.inbox': 'Inbox',
  // marks a task shown on its DEADLINE day in a tide-tasks block
  'block.deadline': 'prazo',
  'newList.name': 'Nome',
  'newList.create': 'Criar',
  'newList.exists': 'Já existe uma nota com esse nome.',
  'newList.invalid': 'Não foi possível criar a nota com esse nome.',
  'settings.periodsFolder': 'Pasta dos períodos',
  'settings.periodsFolder.desc': 'Onde ficam os arquivos de semana, mês e ano. Vazio é a raiz do vault.',
  'settings.inbox': 'Arquivo da Inbox',
  'settings.inbox.desc': 'Caminho da nota da Inbox, que fica no topo da escada como as listas.',
  'settings.listMarker': 'Marcador de lista',
  'settings.listMarker.desc': 'Propriedade e valor (como categories: [[lists]]) ou o nome de uma pasta.',
  'settings.templatesFolder': 'Pasta de templates',
  'settings.templatesFolder.desc':
    'Onde ficam Week.md, Month.md e Year.md. O template do daily vem das configurações do Daily notes.',
  // written into the :LOGBOOK: entry of a repeating task, before the occurrence date
  'logbook.occurrence': 'ocorrência de',
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
