// All UI text lives here. Only pt-BR for now; another language is another table with the same keys.
const ptBR = {
  'command.nextState': 'Avançar estado da tarefa',
  'command.prevState': 'Voltar estado da tarefa',
  'command.priorityUp': 'Aumentar prioridade da tarefa',
  'command.priorityDown': 'Diminuir prioridade da tarefa',
  'command.newList': 'Nova lista',
  'command.newHabit': 'Novo hábito',
  'command.newContext': 'Novo contexto',
  'command.declareContext': 'Declarar contexto',
  'command.renameHabit': 'Renomear hábito',
  'command.fixOrphan': 'Corrigir hábito órfão',
  'command.openWeek': 'Abrir esta semana',
  'command.openMonth': 'Abrir este mês',
  'command.openYear': 'Abrir este ano',
  'command.moveTo': 'Mover para…',
  'command.migrate': 'Migrar pendentes para hoje',
  'command.fix': 'Corrigir linha fora da regra',
  'command.toggleTasks': 'Recolher ou expandir as tarefas',
  'command.openList': 'Abrir lista de tarefas',
  'command.openAgenda': 'Abrir agenda',
  'command.openCalendar': 'Abrir calendário',
  'command.capture': 'Capturar na Inbox',
  // the calendar view: the month navigation
  'calendar.title': 'Calendário',
  'calendar.prev': 'Mês anterior',
  'calendar.next': 'Próximo mês',
  'calendar.today': 'Hoje',
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
  // quick capture: the modal of the command and the notices, also shown for the obsidian:// URI
  'capture.label': 'Tarefa',
  'capture.add': 'Capturar',
  'capture.done': 'Capturado na Inbox.',
  'capture.failed': 'Não foi possível escrever na Inbox: ',
  'newNote.name': 'Nome',
  'newNote.create': 'Criar',
  'newNote.exists': 'Já existe uma nota com esse nome.',
  'newNote.invalid': 'Não foi possível criar a nota com esse nome.',
  // the habit's name is the key of its mark in the daily's frontmatter, so it can't clash with another property
  'newHabit.used': 'Esse nome já é uma propriedade usada no vault.',
  // Rename habit: the note and the key of its marks in every daily
  'renameHabit.invalid': 'Não foi possível renomear a nota com esse nome.',
  // a mark whose key no habit note has, as after renaming the note outside the plugin; never fixed by itself
  'orphan.mark': 'Nenhuma nota de hábito tem esse nome: Corrigir liga a marca a um hábito',
  'orphan.fix': 'Corrigir',
  'orphan.pickKey': 'Qual marca órfã corrigir?',
  'orphan.pickHabit': 'De qual hábito é essa marca?',
  // Declare context: the interval its line pauses the habits of the context's pause
  'declare.label': 'Intervalo (2026-11-01 → 2026-11-07, ou um dia)',
  'declare.add': 'Declarar',
  'declare.invalid': 'Intervalo inválido: use 2026-11-01 → 2026-11-07, ou uma data só.',
  'declare.empty': 'Este contexto não tem hábitos em pause.',
  // the tide-habits block: a future day shows its habits read-only
  'habits.future': 'Dia futuro: só leitura',
  // the habits not planned on the day, folded below the planned ones
  'habits.others': 'Outros',
  // after the goal's progress, as in 2/8 hoje or 1/3 na semana
  'habits.per.day': 'hoje',
  'habits.per.week': 'na semana',
  'habits.per.month': 'no mês',
  'habits.per.year': 'no ano',
  'settings.periodsFolder': 'Pasta dos períodos',
  'settings.periodsFolder.desc': 'Onde ficam os arquivos de semana, mês e ano. Vazio é a raiz do vault.',
  'settings.inbox': 'Arquivo da Inbox',
  'settings.inbox.desc': 'Caminho da nota da Inbox, que fica no topo da escada como as listas.',
  'settings.listMarker': 'Marcador de lista',
  'settings.listMarker.desc': 'Propriedade e valor (como categories: [[lists]]) ou o nome de uma pasta.',
  'settings.habitMarker': 'Marcador de hábito',
  'settings.habitMarker.desc': 'Propriedade e valor (como categories: [[habits]]) ou o nome de uma pasta.',
  'settings.contextMarker': 'Marcador de contexto',
  'settings.contextMarker.desc': 'Propriedade e valor (como categories: [[contexts]]) ou o nome de uma pasta.',
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
