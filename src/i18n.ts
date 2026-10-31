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
  'command.migrate': 'Migrar pendentes para hoje',
  'command.fix': 'Corrigir linha fora da regra',
  'command.toggleTasks': 'Recolher ou expandir as tarefas',
  'command.openList': 'Abrir lista de tarefas',
  'command.openAgenda': 'Abrir agenda',
  // the agenda view: its sections and the mark on today
  'agenda.title': 'Agenda',
  'agenda.overdue': 'Atrasadas',
  'agenda.pending': 'Pendentes',
  'agenda.today': 'hoje',
  // the list view and its filters
  'list.title': 'Tarefas',
  'list.empty': 'Nenhuma tarefa com esses filtros.',
  'filter.state': 'Estado',
  'filter.priority': 'Prioridade',
  'filter.place': 'Lugar',
  // the name of the :ABOUT: property, kept in en as the property and block names are
  'filter.about': 'About',
  'filter.tag': 'Tag',
  'filter.category': 'Categoria',
  'filter.any': 'todas',
  'filter.open': 'abertas',
  'filter.none': 'sem',
  'place.list': 'lista',
  'place.year': 'ano',
  'place.month': 'mês',
  'place.week': 'semana',
  'place.day': 'dia',
  // the mark on a line off the rule, shown on hover
  'offRule.repeater': 'Repetição mora numa lista: Corrigir move para uma lista',
  'offRule.scheduled': 'No daily, o SCHEDULED só guarda a hora: Corrigir move para o dia da data',
  // the notice in today's daily: "3 pendentes · migrar"
  'pending.one': 'pendente',
  'pending.many': 'pendentes',
  'pending.migrate': 'migrar',
  // the summary of a folded task in the Padrão visual: clicking it opens the details
  'fold.open': 'Abrir detalhes',
  'move.placeholder': 'Hoje, uma lista ou uma data: 2026-11-03, 2026-W45, 2026-11, 2026',
  'move.placeholderList': 'Uma lista ou a Inbox',
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
  'settings.visual': 'Visual das tarefas',
  'settings.visual.desc':
    'No Live Preview. Org: o texto colorido. Padrão: o checkbox do Obsidian, com os detalhes recolhidos num resumo.',
  'settings.visual.org': 'Org',
  'settings.visual.standard': 'Padrão',
  'settings.theme': 'Tema de cor',
  'settings.theme.desc': 'As cores dos estados no visual Org e nos checkboxes. Claro ou escuro segue o Obsidian.',
  'settings.theme.obsidian': 'Padrão do Obsidian',
  'settings.theme.doom-one': 'Doom One',
  'settings.theme.gruvbox': 'Gruvbox',
  'settings.theme.solarized': 'Solarized',
  'settings.theme.catppuccin': 'Catppuccin',
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
