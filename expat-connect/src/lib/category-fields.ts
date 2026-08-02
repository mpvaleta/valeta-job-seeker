export type CategoryField =
  | { key: string; label: string; type: 'text' | 'textarea' | 'boolean'; help?: string; maxLength?: number }
  | { key: string; label: string; type: 'multiselect'; options: string[]; help?: string }
  | { key: string; label: string; type: 'price_range'; help?: string };

// What each category collects, beyond the shared fields. Deliberately
// excludes patient/client health data, IDs, or anything privileged.
export const CATEGORY_FIELDS: Record<string, CategoryField[]> = {
  doctors: [
    { key: 'specialties', label: 'Especialidades', type: 'multiselect',
      options: ['Clínica geral', 'Pediatria', 'Cardiologia', 'Dermatologia', 'Ginecologia',
        'Ortopedia', 'Psiquiatria', 'Endocrinologia', 'Oftalmologia', 'Outra'] },
    { key: 'telehealth', label: 'Oferece teleconsulta', type: 'boolean' },
    { key: 'insurers', label: 'Convênios/planos aceitos', type: 'text', maxLength: 300,
      help: 'Liste os planos aceitos. Não inclua dados de pacientes.' },
    { key: 'hospital_affiliations', label: 'Hospitais/clínicas afiliadas', type: 'text', maxLength: 300 }
  ],
  dentists: [
    { key: 'services', label: 'Serviços', type: 'multiselect',
      options: ['Clínica geral', 'Ortodontia', 'Implantes', 'Estética', 'Endodontia',
        'Odontopediatria', 'Emergência'] },
    { key: 'insurers', label: 'Convênios aceitos', type: 'text', maxLength: 300 },
    { key: 'emergency', label: 'Atende emergências', type: 'boolean' }
  ],
  therapists: [
    { key: 'approaches', label: 'Abordagens', type: 'multiselect',
      options: ['TCC', 'Psicanálise', 'Humanista', 'Terapia de casal', 'Infantil', 'EMDR', 'Gestalt', 'Outra'] },
    { key: 'focus', label: 'Áreas de foco', type: 'multiselect',
      options: ['Ansiedade', 'Depressão', 'Adaptação de expatriados', 'Luto', 'Relacionamentos', 'Trauma', 'Autoestima'] },
    { key: 'telehealth', label: 'Atende online', type: 'boolean' },
    { key: 'sliding_scale', label: 'Valor social / escala móvel', type: 'boolean' }
  ],
  lawyers: [
    { key: 'practice_areas', label: 'Áreas de atuação', type: 'multiselect',
      options: ['Imigração', 'Família', 'Trabalhista', 'Empresarial', 'Criminal', 'Imobiliário', 'Tributário', 'Contratos'] },
    { key: 'bar_jurisdictions', label: 'Onde é habilitado(a)', type: 'text', maxLength: 200,
      help: 'Ex: OAB/SP, State Bar of Florida.' },
    { key: 'free_consultation', label: 'Consulta inicial gratuita', type: 'boolean' }
  ],
  immigration: [
    { key: 'services', label: 'Serviços', type: 'multiselect',
      options: ['Vistos', 'Green Card', 'Cidadania', 'Autorização de residência', 'Reagrupamento familiar', 'Asilo', 'Renovações'] },
    { key: 'countries', label: 'Países atendidos', type: 'text', maxLength: 200 },
    { key: 'free_consultation', label: 'Avaliação inicial gratuita', type: 'boolean' }
  ],
  accountants: [
    { key: 'services', label: 'Serviços', type: 'multiselect',
      options: ['Imposto de renda (EUA)', 'Imposto Brasil', 'FBAR', 'Abertura de empresa', 'Contabilidade mensal', 'Planejamento tributário', 'ITIN'] },
    { key: 'dual_country', label: 'Atende renda nos dois países', type: 'boolean' }
  ],
  insurance: [
    { key: 'lines', label: 'Tipos de seguro', type: 'multiselect',
      options: ['Saúde', 'Vida', 'Auto', 'Residencial', 'Viagem', 'Empresarial'] },
    { key: 'carriers', label: 'Seguradoras representadas', type: 'text', maxLength: 300 }
  ],
  beauty: [
    { key: 'services', label: 'Serviços', type: 'multiselect',
      options: ['Cabelo', 'Progressiva', 'Manicure/Pedicure', 'Maquiagem', 'Sobrancelhas', 'Depilação', 'Estética facial', 'Barbearia'] },
    { key: 'price_range', label: 'Faixa de preço', type: 'price_range' },
    { key: 'home_service', label: 'Atende a domicílio', type: 'boolean' }
  ],
  realestate: [
    { key: 'services', label: 'Serviços', type: 'multiselect',
      options: ['Compra', 'Venda', 'Aluguel', 'Administração', 'Investimento', 'Financiamento'] },
    { key: 'areas', label: 'Regiões atendidas', type: 'text', maxLength: 200 }
  ],
  education: [
    { key: 'subjects', label: 'Matérias/aulas', type: 'multiselect',
      options: ['Português', 'Inglês', 'Espanhol', 'Reforço escolar', 'Música', 'Preparatório', 'Aulas para crianças'] },
    { key: 'format', label: 'Formato', type: 'multiselect', options: ['Presencial', 'Online', 'Em grupo', 'Individual'] }
  ],
  gynecologists: [
    { key: 'services', label: 'Serviços', type: 'multiselect',
      options: ['Consulta de rotina', 'Pré-natal', 'Planejamento familiar', 'Menopausa', 'Ultrassom', 'Adolescentes'] },
    { key: 'telehealth', label: 'Oferece teleconsulta', type: 'boolean' },
    { key: 'insurers', label: 'Convênios aceitos', type: 'text', maxLength: 300 }
  ],
  services: [
    { key: 'service_type', label: 'Tipo de serviço', type: 'text', maxLength: 120 },
    { key: 'price_range', label: 'Faixa de preço', type: 'price_range' },
    { key: 'home_service', label: 'Atende a domicílio', type: 'boolean' }
  ]
};

export function fieldsForCategory(slug: string): CategoryField[] {
  return CATEGORY_FIELDS[slug] ?? [];
}
