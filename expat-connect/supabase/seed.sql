-- Sample professionals are FICTIONAL placeholders for testing.
-- Replace with real, verified professionals before launch.
insert into languages (code, name_pt, name_en) values
  ('pt', 'Português', 'Portuguese'), ('en', 'Inglês', 'English'), ('es', 'Espanhol', 'Spanish'),
  ('fr', 'Francês', 'French'), ('it', 'Italiano', 'Italian'), ('de', 'Alemão', 'German'), ('ja', 'Japonês', 'Japanese');

insert into categories (slug, name_pt, name_en, icon, sort_order) values
  ('doctors', 'Médicos', 'Doctors', 'stethoscope', 10),
  ('dentists', 'Dentistas', 'Dentists', 'tooth', 20),
  ('therapists', 'Psicólogos e Terapeutas', 'Therapists', 'brain', 30),
  ('lawyers', 'Advogados', 'Lawyers', 'scale', 40),
  ('immigration', 'Assessoria de Imigração', 'Immigration Services', 'passport', 50),
  ('accountants', 'Contadores', 'Accountants', 'calculator', 60),
  ('insurance', 'Seguros e Planos de Saúde', 'Insurance & Health Plans', 'shield', 70),
  ('beauty', 'Beleza e Estética', 'Beauty & Aesthetics', 'scissors', 80),
  ('realestate', 'Imobiliário', 'Real Estate', 'home', 90),
  ('education', 'Educação e Aulas', 'Education & Tutoring', 'book', 100),
  ('gynecologists', 'Ginecologistas', 'Gynecologists', 'heart', 110),
  ('services', 'Serviços Gerais', 'General Services', 'wrench', 120);

insert into professionals
  (slug, full_name, category_id, headline, bio, country, city, whatsapp, credentials, accepts_insurance, online_service, status, verified, plan)
values
  ('dra-ana-souza-boston', 'Dra. Ana Souza', (select id from categories where slug = 'doctors'),
   'Médica de família brasileira em Boston', 'Atendimento em português para toda a família. Formada pela USP com residência nos EUA.',
   'US', 'Boston', '+1 555 0101', 'MD — Massachusetts Board of Medicine #000000', 'Blue Cross, Aetna, MassHealth', false, 'approved', true, 'free'),
  ('dr-carlos-lima-orlando', 'Dr. Carlos Lima', (select id from categories where slug = 'dentists'),
   'Dentista brasileiro em Orlando', 'Clínica geral, estética e ortodontia. Atendimento em português e inglês.',
   'US', 'Orlando', '+1 555 0102', 'DDS — Florida Board of Dentistry #000000', 'Delta Dental, Cigna', false, 'approved', true, 'free'),
  ('mariana-costa-psicologa-online', 'Mariana Costa', (select id from categories where slug = 'therapists'),
   'Psicóloga brasileira — atendimento online mundial', 'Especialista em adaptação de expatriados, ansiedade e transições de vida. Sessões por vídeo.',
   'BR', 'São Paulo', '+55 11 95555 0103', 'CRP 06/000000', '', true, 'approved', true, 'free'),
  ('joao-pereira-advogado-lisboa', 'João Pereira', (select id from categories where slug = 'immigration'),
   'Vistos e cidadania em Portugal', 'Assessoria completa para brasileiros: vistos, autorização de residência e cidadania portuguesa.',
   'PT', 'Lisboa', '+351 555 0104', 'OA Portugal #000000', '', true, 'approved', true, 'free'),
  ('fernanda-alves-contadora-miami', 'Fernanda Alves', (select id from categories where slug = 'accountants'),
   'Impostos americanos para brasileiros', 'Declaração de imposto de renda nos EUA, FBAR e planejamento para quem tem renda nos dois países.',
   'US', 'Miami', '+1 555 0105', 'CPA — Florida #000000', '', true, 'approved', true, 'free'),
  ('salao-brasil-newark', 'Salão Brasil', (select id from categories where slug = 'beauty'),
   'Salão brasileiro em Newark', 'Escova progressiva, corte e manicure. Equipe 100% brasileira.',
   'US', 'Newark', '+1 555 0106', '', '', false, 'approved', false, 'free');

insert into professional_languages (professional_id, language_code)
select p.id, l.code from professionals p cross join lateral (values ('pt'), ('en')) as v(code) join languages l on l.code = v.code;
