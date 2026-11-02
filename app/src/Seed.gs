/**
 * Dados de referência (sempre): categorias financeiras, exercícios, alimentos (TACO aprox.), timers e modelos de rotina.
 * Idempotente por usuário.
 */
var Seed = (function () {
  var C = ['#F2B705', '#F6D365', '#B98900', '#C4684A', '#5F9E8F', '#8FA3B8', '#9A9A9A', '#5A5A5A'];

  // [nome, cor, ícone, [subcategorias]]
  var CAT_DESPESA = [
    ['Moradia', C[0], 'home', ['Aluguel', 'Condomínio', 'Energia', 'Água', 'Internet', 'Manutenção']],
    ['Mercado', C[4], 'cart', []],
    ['Alimentação fora', C[3], 'utensils', ['Restaurante', 'Delivery', 'Padaria e café']],
    ['Transporte', C[5], 'car', ['Combustível', 'App de transporte', 'Transporte público', 'Estacionamento', 'Manutenção do carro']],
    ['Saúde', C[4], 'heart', ['Farmácia', 'Consultas', 'Plano de saúde', 'Academia']],
    ['Educação', C[2], 'book', ['Cursos', 'Livros', 'Faculdade']],
    ['Lazer', C[1], 'ticket', ['Cinema e shows', 'Passeios', 'Jogos']],
    ['Assinaturas', C[5], 'repeat', []],
    ['Compras', C[3], 'bag', ['Roupas', 'Eletrônicos', 'Casa']],
    ['Impostos', C[6], 'landmark', ['IPVA', 'IPTU', 'Taxas']],
    ['Pets', C[2], 'paw', []],
    ['Viagem', C[0], 'plane', []],
    ['Presentes', C[1], 'gift', []],
    ['Outros', C[7], 'dots', []]
  ];
  var CAT_RECEITA = [
    ['Salário', C[0], 'briefcase', []], ['Freelas', C[4], 'laptop', []], ['Rendimentos', C[2], 'trending', []], ['Outras receitas', C[6], 'dots', []]
  ];

  // [nome, grupo, equipamento, tipo, MET, secundários]
  var EXERCICIOS = [
    ['Supino reto com barra', 'peito', 'barra', 'forca', 6, 'tríceps, ombro anterior'],
    ['Supino inclinado com halteres', 'peito', 'halter', 'forca', 6, 'ombro anterior, tríceps'],
    ['Supino inclinado com barra', 'peito', 'barra', 'forca', 6, 'ombro anterior, tríceps'],
    ['Supino declinado', 'peito', 'barra', 'forca', 6, 'tríceps'],
    ['Supino reto na máquina', 'peito', 'maquina', 'forca', 5, 'tríceps'],
    ['Crucifixo com halteres', 'peito', 'halter', 'forca', 5, 'ombro anterior'],
    ['Crossover na polia', 'peito', 'polia', 'forca', 5, 'ombro anterior'],
    ['Peck deck', 'peito', 'maquina', 'forca', 5, ''],
    ['Flexão de braço', 'peito', 'peso_corporal', 'forca', 8, 'tríceps, core'],
    ['Puxada frontal', 'costas', 'polia', 'forca', 5, 'bíceps'],
    ['Barra fixa', 'costas', 'peso_corporal', 'forca', 8, 'bíceps, core'],
    ['Remada curvada com barra', 'costas', 'barra', 'forca', 6, 'bíceps, lombar'],
    ['Remada unilateral com halter', 'costas', 'halter', 'forca', 5, 'bíceps'],
    ['Remada baixa na polia', 'costas', 'polia', 'forca', 5, 'bíceps'],
    ['Remada cavalinho', 'costas', 'barra', 'forca', 6, 'bíceps'],
    ['Pulldown com braços estendidos', 'costas', 'polia', 'forca', 4, 'tríceps longo'],
    ['Levantamento terra', 'costas', 'barra', 'forca', 6, 'posterior, glúteos, lombar'],
    ['Hiperextensão lombar', 'costas', 'peso_corporal', 'forca', 4, 'glúteos'],
    ['Desenvolvimento com halteres', 'ombros', 'halter', 'forca', 5, 'tríceps'],
    ['Desenvolvimento militar com barra', 'ombros', 'barra', 'forca', 6, 'tríceps, core'],
    ['Arnold press', 'ombros', 'halter', 'forca', 5, 'tríceps'],
    ['Elevação lateral', 'ombros', 'halter', 'forca', 4, ''],
    ['Elevação frontal', 'ombros', 'halter', 'forca', 4, ''],
    ['Crucifixo inverso', 'ombros', 'halter', 'forca', 4, 'costas superior'],
    ['Face pull', 'ombros', 'polia', 'forca', 4, 'costas superior'],
    ['Encolhimento com halteres', 'ombros', 'halter', 'forca', 4, 'trapézio'],
    ['Rosca direta com barra', 'biceps', 'barra', 'forca', 4, 'antebraço'],
    ['Rosca alternada', 'biceps', 'halter', 'forca', 4, 'antebraço'],
    ['Rosca martelo', 'biceps', 'halter', 'forca', 4, 'braquiorradial'],
    ['Rosca scott', 'biceps', 'maquina', 'forca', 4, ''],
    ['Rosca na polia', 'biceps', 'polia', 'forca', 4, ''],
    ['Rosca concentrada', 'biceps', 'halter', 'forca', 4, ''],
    ['Tríceps na polia com corda', 'triceps', 'polia', 'forca', 4, ''],
    ['Tríceps testa', 'triceps', 'barra', 'forca', 4, ''],
    ['Tríceps francês', 'triceps', 'halter', 'forca', 4, ''],
    ['Tríceps coice', 'triceps', 'halter', 'forca', 4, ''],
    ['Mergulho entre bancos', 'triceps', 'peso_corporal', 'forca', 5, 'peito, ombro'],
    ['Supino fechado', 'triceps', 'barra', 'forca', 5, 'peito'],
    ['Rosca de punho', 'antebraco', 'halter', 'forca', 3.5, ''],
    ['Agachamento livre', 'quadriceps', 'barra', 'forca', 6, 'glúteos, posterior, core'],
    ['Agachamento no smith', 'quadriceps', 'smith', 'forca', 6, 'glúteos'],
    ['Agachamento goblet', 'quadriceps', 'kettlebell', 'forca', 6, 'glúteos, core'],
    ['Leg press 45°', 'quadriceps', 'maquina', 'forca', 6, 'glúteos'],
    ['Hack machine', 'quadriceps', 'maquina', 'forca', 6, 'glúteos'],
    ['Cadeira extensora', 'quadriceps', 'maquina', 'forca', 5, ''],
    ['Agachamento búlgaro', 'quadriceps', 'halter', 'forca', 6, 'glúteos'],
    ['Afundo com halteres', 'quadriceps', 'halter', 'forca', 6, 'glúteos'],
    ['Mesa flexora', 'posterior', 'maquina', 'forca', 5, ''],
    ['Cadeira flexora', 'posterior', 'maquina', 'forca', 5, ''],
    ['Stiff com barra', 'posterior', 'barra', 'forca', 6, 'glúteos, lombar'],
    ['Levantamento terra romeno', 'posterior', 'halter', 'forca', 6, 'glúteos'],
    ['Good morning', 'posterior', 'barra', 'forca', 5, 'lombar'],
    ['Elevação pélvica', 'gluteos', 'barra', 'forca', 5, 'posterior'],
    ['Abdução na máquina', 'gluteos', 'maquina', 'forca', 4, ''],
    ['Coice na polia', 'gluteos', 'polia', 'forca', 4, ''],
    ['Ponte de glúteo', 'gluteos', 'peso_corporal', 'forca', 3.5, 'posterior'],
    ['Glúteo quatro apoios', 'gluteos', 'peso_corporal', 'forca', 3.5, ''],
    ['Panturrilha em pé', 'panturrilha', 'maquina', 'forca', 4, ''],
    ['Panturrilha sentada', 'panturrilha', 'maquina', 'forca', 4, ''],
    ['Panturrilha no leg press', 'panturrilha', 'maquina', 'forca', 4, ''],
    ['Abdominal supra', 'abdomen', 'peso_corporal', 'forca', 3.8, ''],
    ['Abdominal infra', 'abdomen', 'peso_corporal', 'forca', 3.8, ''],
    ['Abdominal oblíquo', 'abdomen', 'peso_corporal', 'forca', 3.8, ''],
    ['Abdominal na polia', 'abdomen', 'polia', 'forca', 4, ''],
    ['Elevação de pernas na barra', 'abdomen', 'peso_corporal', 'forca', 5, 'flexores do quadril'],
    ['Prancha', 'abdomen', 'peso_corporal', 'forca', 3.8, 'core'],
    ['Prancha lateral', 'abdomen', 'peso_corporal', 'forca', 3.8, 'oblíquos'],
    ['Roda abdominal', 'abdomen', 'outro', 'forca', 5, 'core'],
    ['Corrida na esteira', 'cardio', 'nenhum', 'cardio', 9.8, ''],
    ['Caminhada na esteira', 'cardio', 'nenhum', 'cardio', 4.3, ''],
    ['Bicicleta ergométrica', 'cardio', 'nenhum', 'cardio', 7, ''],
    ['Elíptico', 'cardio', 'nenhum', 'cardio', 5, ''],
    ['Remo ergômetro', 'cardio', 'nenhum', 'cardio', 7, 'costas'],
    ['Escada', 'cardio', 'nenhum', 'cardio', 8.8, ''],
    ['Pular corda', 'cardio', 'outro', 'cardio', 11.8, ''],
    ['Burpee', 'corpo_todo', 'peso_corporal', 'funcional', 8, ''],
    ['Kettlebell swing', 'corpo_todo', 'kettlebell', 'funcional', 8, 'glúteos, posterior'],
    ['Thruster', 'corpo_todo', 'barra', 'funcional', 8, ''],
    ['Polichinelo', 'corpo_todo', 'peso_corporal', 'funcional', 8, ''],
    ['Mountain climber', 'corpo_todo', 'peso_corporal', 'funcional', 8, 'core'],
    ['Box jump', 'corpo_todo', 'outro', 'funcional', 8, ''],
    ['Farmer walk', 'corpo_todo', 'halter', 'funcional', 6, 'antebraço, trapézio'],
    ['Alongamento de posterior', 'posterior', 'nenhum', 'mobilidade', 2.3, ''],
    ['Mobilidade de quadril', 'gluteos', 'nenhum', 'mobilidade', 2.5, ''],
    ['Mobilidade torácica', 'costas', 'nenhum', 'mobilidade', 2.5, ''],
    ['Yoga (fluxo)', 'corpo_todo', 'nenhum', 'mobilidade', 3, '']
  ];

  // [nome, porção, porção_g, kcal, prot, carb, gord, fibra, sódio mg, cálcio mg, ferro mg, potássio mg, vit C mg] por 100 g
  var ALIMENTOS = [
    ['Arroz branco cozido', '1 escumadeira (90 g)', 90, 128, 2.5, 28.1, 0.2, 1.6, 1, 4, 0.1, 15, 0],
    ['Arroz integral cozido', '1 escumadeira (90 g)', 90, 124, 2.6, 25.8, 1.0, 2.7, 1, 5, 0.3, 75, 0],
    ['Feijão carioca cozido', '1 concha (86 g)', 86, 76, 4.8, 13.6, 0.5, 8.5, 2, 27, 1.3, 255, 0],
    ['Feijão preto cozido', '1 concha (86 g)', 86, 77, 4.5, 14.0, 0.5, 8.4, 2, 29, 1.5, 256, 0],
    ['Lentilha cozida', '1 concha (90 g)', 90, 93, 6.3, 16.3, 0.5, 7.9, 1, 16, 1.5, 220, 0],
    ['Grão-de-bico cozido', '3 colheres (60 g)', 60, 164, 8.9, 27.4, 2.6, 7.6, 7, 49, 2.9, 291, 1.3],
    ['Macarrão cozido', '1 pegador (110 g)', 110, 131, 5.0, 25.0, 1.1, 1.8, 1, 7, 0.5, 44, 0],
    ['Cuscuz de milho cozido', '1 fatia (100 g)', 100, 113, 2.2, 25.3, 0.7, 2.1, 247, 2, 0.2, 30, 0],
    ['Quinoa cozida', '3 colheres (60 g)', 60, 120, 4.4, 21.3, 1.9, 2.8, 7, 17, 1.5, 172, 0],
    ['Batata inglesa cozida', '1 unidade média (130 g)', 130, 52, 1.2, 11.9, 0.0, 1.3, 2, 4, 0.2, 160, 3.8],
    ['Batata-doce cozida', '1 unidade média (150 g)', 150, 77, 0.6, 18.4, 0.1, 2.2, 3, 17, 0.2, 230, 23.8],
    ['Mandioca cozida', '1 pedaço (100 g)', 100, 125, 0.6, 30.1, 0.3, 1.6, 1, 19, 0.1, 100, 11.1],
    ['Mandioquinha cozida', '1 unidade (90 g)', 90, 80, 0.9, 18.9, 0.2, 1.8, 2, 12, 0.4, 258, 17],
    ['Batata frita', '1 porção pequena (80 g)', 80, 267, 5.0, 35.6, 13.1, 8.1, 2, 6, 0.4, 579, 9],
    ['Pão francês', '1 unidade (50 g)', 50, 300, 8.0, 58.6, 3.1, 2.3, 648, 16, 1.0, 142, 0],
    ['Pão de forma integral', '2 fatias (50 g)', 50, 253, 9.4, 49.9, 3.7, 6.9, 506, 132, 3.0, 240, 0],
    ['Pão de queijo', '1 unidade média (40 g)', 40, 363, 5.1, 34.2, 24.6, 0.6, 773, 102, 0.3, 60, 0],
    ['Tapioca (goma hidratada)', '1 tapioca (60 g)', 60, 240, 0.2, 59.6, 0.1, 0.5, 1, 10, 0.4, 10, 0],
    ['Aveia em flocos', '2 colheres (30 g)', 30, 394, 13.9, 66.6, 8.5, 9.1, 5, 48, 4.4, 336, 0],
    ['Granola', '3 colheres (40 g)', 40, 421, 10.0, 66.0, 13.0, 7.0, 30, 60, 3.0, 400, 0],
    ['Farinha de mandioca', '1 colher (16 g)', 16, 361, 1.6, 87.9, 0.3, 6.4, 1, 65, 1.1, 340, 0],
    ['Farofa pronta', '2 colheres (30 g)', 30, 406, 2.1, 80.3, 9.1, 7.8, 1067, 30, 1.5, 200, 0],
    ['Milho verde em lata', '3 colheres (60 g)', 60, 98, 3.2, 17.1, 2.4, 4.6, 260, 2, 0.6, 160, 1.6],
    ['Ervilha em lata', '3 colheres (60 g)', 60, 74, 4.6, 13.4, 0.4, 5.1, 372, 22, 1.4, 120, 9.6],
    ['Ovo de galinha cozido', '1 unidade (50 g)', 50, 146, 13.3, 0.6, 9.5, 0, 146, 49, 1.5, 140, 0],
    ['Ovo frito', '1 unidade (50 g)', 50, 240, 15.6, 1.2, 18.6, 0, 155, 73, 2.1, 150, 0],
    ['Clara de ovo cozida', '2 claras (60 g)', 60, 59, 13.4, 0, 0.1, 0, 181, 6, 0.1, 150, 0],
    ['Peito de frango grelhado', '1 filé médio (120 g)', 120, 159, 32.0, 0, 2.5, 0, 50, 5, 0.3, 330, 0],
    ['Coxa de frango assada', '1 unidade (90 g)', 90, 215, 28.5, 0, 11.0, 0, 95, 12, 1.1, 240, 0],
    ['Patinho grelhado', '1 bife médio (100 g)', 100, 219, 35.9, 0, 7.3, 0, 49, 5, 3.0, 340, 0],
    ['Patinho moído refogado', '3 colheres (90 g)', 90, 219, 35.9, 0, 7.3, 0, 60, 5, 3.0, 340, 0],
    ['Alcatra grelhada', '1 bife médio (100 g)', 100, 241, 31.9, 0, 11.6, 0, 56, 4, 3.4, 330, 0],
    ['Contrafilé grelhado', '1 bife médio (100 g)', 100, 278, 32.0, 0, 15.5, 0, 59, 4, 2.6, 300, 0],
    ['Picanha grelhada', '1 fatia (100 g)', 100, 289, 26.4, 0, 19.5, 0, 60, 4, 2.4, 290, 0],
    ['Carne moída (acém) refogada', '3 colheres (90 g)', 90, 212, 26.7, 0, 10.9, 0, 52, 4, 2.7, 300, 0],
    ['Lombo de porco assado', '1 fatia (100 g)', 100, 210, 35.7, 0, 6.4, 0, 39, 7, 0.9, 400, 0],
    ['Linguiça toscana grelhada', '1 gomo (80 g)', 80, 296, 23.2, 0, 21.6, 0, 1203, 8, 1.0, 290, 0],
    ['Tilápia grelhada', '1 filé (120 g)', 120, 128, 26.2, 0, 2.7, 0, 56, 14, 0.7, 380, 0],
    ['Salmão grelhado', '1 posta (120 g)', 120, 229, 23.9, 0, 14.0, 0, 59, 9, 0.3, 400, 0],
    ['Atum em lata (água)', '1/2 lata (60 g)', 60, 116, 25.5, 0, 0.8, 0, 338, 11, 1.5, 237, 0],
    ['Sardinha em lata (óleo)', '1/2 lata (60 g)', 60, 285, 15.9, 0, 24.0, 0, 666, 550, 3.5, 400, 0],
    ['Camarão cozido', '6 unidades (80 g)', 80, 90, 19.0, 0, 1.0, 0, 366, 90, 1.3, 170, 0],
    ['Peito de peru fatiado', '3 fatias (45 g)', 45, 104, 18.0, 3.6, 1.6, 0, 1100, 10, 0.6, 250, 0],
    ['Presunto cozido', '3 fatias (45 g)', 45, 94, 14.3, 2.1, 2.7, 0, 1021, 23, 0.9, 260, 0],
    ['Salsicha', '1 unidade (50 g)', 50, 257, 12.0, 3.4, 21.7, 0, 1130, 7, 1.4, 160, 0],
    ['Mortadela', '3 fatias (45 g)', 45, 269, 12.0, 5.8, 21.6, 0, 1212, 67, 1.5, 180, 0],
    ['Tofu', '1 fatia (80 g)', 80, 76, 8.1, 1.9, 4.8, 0.3, 7, 350, 5.4, 121, 0.1],
    ['Proteína de soja texturizada (seca)', '3 colheres (30 g)', 30, 330, 52.0, 30.0, 1.0, 17.0, 3, 240, 9.0, 2200, 0],
    ['Queijo minas frescal', '1 fatia (30 g)', 30, 264, 17.4, 3.2, 20.2, 0, 31, 579, 0.9, 105, 0],
    ['Queijo muçarela', '2 fatias (30 g)', 30, 330, 22.6, 3.0, 25.2, 0, 581, 875, 0.3, 62, 0],
    ['Queijo prato', '2 fatias (30 g)', 30, 360, 22.7, 1.9, 29.1, 0, 580, 940, 0.3, 64, 0],
    ['Requeijão cremoso', '1 colher (30 g)', 30, 257, 9.6, 2.4, 23.4, 0, 558, 259, 0.1, 100, 0],
    ['Ricota', '2 colheres (40 g)', 40, 140, 12.6, 3.8, 8.1, 0, 283, 253, 0.1, 110, 0],
    ['Iogurte natural integral', '1 pote (170 g)', 170, 51, 4.1, 1.9, 3.0, 0, 52, 143, 0, 150, 1],
    ['Iogurte natural desnatado', '1 pote (170 g)', 170, 41, 3.8, 5.8, 0.3, 0, 60, 157, 0, 160, 1],
    ['Leite integral', '1 copo (200 ml)', 200, 61, 3.2, 4.8, 3.3, 0, 43, 113, 0, 132, 0],
    ['Leite desnatado', '1 copo (200 ml)', 200, 35, 3.4, 4.9, 0.2, 0, 51, 122, 0, 156, 0],
    ['Leite em pó integral', '2 colheres (26 g)', 26, 497, 25.4, 39.2, 26.9, 0, 371, 890, 0.5, 1330, 6],
    ['Whey protein concentrado', '1 dosador (30 g)', 30, 400, 80.0, 8.0, 6.0, 0, 200, 400, 1.0, 500, 0],
    ['Manteiga com sal', '1 colher de chá (10 g)', 10, 726, 0.4, 0.1, 82.4, 0, 579, 9, 0, 15, 0],
    ['Azeite de oliva', '1 colher de sopa (13 ml)', 13, 884, 0, 0, 100, 0, 0, 0, 0.6, 1, 0],
    ['Óleo de soja', '1 colher de sopa (13 ml)', 13, 884, 0, 0, 100, 0, 0, 0, 0, 0, 0],
    ['Pasta de amendoim', '1 colher de sopa (15 g)', 15, 588, 25.0, 20.0, 50.0, 6.0, 17, 43, 1.9, 649, 0],
    ['Amendoim torrado sem sal', '1 punhado (30 g)', 30, 589, 27.0, 20.0, 50.0, 8.0, 6, 54, 2.3, 658, 0],
    ['Castanha-do-pará', '2 unidades (8 g)', 8, 643, 14.5, 15.1, 63.5, 7.9, 1, 146, 2.3, 651, 0.7],
    ['Castanha de caju torrada', '1 punhado (30 g)', 30, 570, 18.5, 29.1, 46.3, 3.7, 125, 33, 5.2, 671, 0],
    ['Nozes', '1 punhado (30 g)', 30, 620, 14.0, 18.4, 59.4, 7.2, 5, 105, 2.0, 533, 0],
    ['Amêndoas', '1 punhado (30 g)', 30, 581, 18.6, 29.5, 47.3, 11.6, 0, 237, 3.1, 640, 0],
    ['Chia', '1 colher de sopa (12 g)', 12, 486, 16.5, 42.1, 30.7, 34.4, 16, 631, 7.7, 407, 1.6],
    ['Banana prata', '1 unidade (70 g)', 70, 98, 1.3, 26.0, 0.1, 2.0, 0, 8, 0.4, 358, 21.6],
    ['Banana nanica', '1 unidade (90 g)', 90, 92, 1.4, 23.8, 0.1, 1.9, 0, 3, 0.3, 376, 5.9],
    ['Maçã fuji', '1 unidade (130 g)', 130, 56, 0.3, 15.2, 0, 1.3, 0, 2, 0.1, 75, 2.4],
    ['Laranja pera', '1 unidade (140 g)', 140, 37, 1.0, 8.9, 0.1, 0.8, 0, 22, 0.1, 163, 53.7],
    ['Mamão papaia', '1/2 unidade (150 g)', 150, 40, 0.5, 10.4, 0.1, 1.0, 2, 22, 0.2, 126, 82.2],
    ['Manga palmer', '1 fatia grande (140 g)', 140, 72, 0.4, 19.4, 0.2, 1.6, 2, 12, 0.1, 157, 65.5],
    ['Abacaxi', '1 fatia (75 g)', 75, 48, 0.9, 12.3, 0.1, 1.0, 0, 22, 0.3, 131, 34.6],
    ['Melancia', '1 fatia (200 g)', 200, 33, 0.9, 8.1, 0, 0.1, 0, 8, 0.2, 104, 6.1],
    ['Morango', '10 unidades (120 g)', 120, 30, 0.9, 6.8, 0.3, 1.7, 0, 11, 0.3, 184, 63.6],
    ['Uva itália', '1 cacho pequeno (100 g)', 100, 53, 0.7, 13.6, 0.2, 0.9, 8, 7, 0.1, 162, 3.3],
    ['Abacate', '2 colheres (90 g)', 90, 96, 1.2, 6.0, 8.4, 6.3, 0, 8, 0.2, 206, 8.7],
    ['Pera', '1 unidade (130 g)', 130, 53, 0.6, 14.0, 0.1, 3.0, 0, 8, 0.1, 116, 2.8],
    ['Kiwi', '1 unidade (75 g)', 75, 51, 1.3, 11.5, 0.6, 2.7, 0, 24, 0.3, 269, 70.8],
    ['Goiaba vermelha', '1 unidade (170 g)', 170, 54, 1.1, 13.0, 0.4, 6.2, 0, 4, 0.2, 198, 80.6],
    ['Açaí (polpa sem açúcar)', '1 polpa (100 g)', 100, 58, 0.8, 6.2, 3.9, 2.6, 5, 35, 0.4, 124, 0],
    ['Alface crespa', '1 prato (40 g)', 40, 11, 1.3, 1.7, 0.2, 1.8, 3, 38, 0.4, 267, 15.6],
    ['Tomate', '4 rodelas (60 g)', 60, 15, 1.1, 3.1, 0.2, 1.2, 1, 7, 0.2, 222, 21.2],
    ['Cenoura crua', '1/2 xícara ralada (50 g)', 50, 34, 1.3, 7.7, 0.2, 3.2, 3, 23, 0.2, 315, 5.1],
    ['Brócolis cozido', '3 ramos (60 g)', 60, 25, 2.1, 4.4, 0.5, 3.4, 2, 51, 0.5, 119, 42],
    ['Couve manteiga refogada', '2 colheres (40 g)', 40, 90, 1.7, 8.7, 6.6, 5.7, 11, 177, 0.5, 315, 76.9],
    ['Espinafre refogado', '2 colheres (50 g)', 50, 67, 2.7, 4.2, 5.4, 2.5, 99, 112, 0.6, 400, 2.4],
    ['Abobrinha cozida', '3 colheres (60 g)', 60, 15, 1.1, 3.0, 0.2, 1.6, 1, 13, 0.2, 210, 2.1],
    ['Beterraba cozida', '3 colheres (60 g)', 60, 32, 1.3, 7.2, 0.1, 1.9, 23, 15, 0.2, 245, 1.2],
    ['Abóbora cabotiá cozida', '3 colheres (80 g)', 80, 48, 1.4, 10.8, 0.7, 2.5, 0, 8, 0.1, 205, 7.1],
    ['Chuchu cozido', '3 colheres (60 g)', 60, 19, 0.4, 4.8, 0, 1.0, 1, 11, 0.1, 108, 3.2],
    ['Pepino', '1/2 unidade (60 g)', 60, 10, 0.9, 2.0, 0, 1.1, 0, 10, 0.1, 154, 5],
    ['Cebola crua', '2 colheres (20 g)', 20, 39, 1.7, 8.9, 0.1, 2.2, 1, 14, 0.2, 176, 4.7],
    ['Repolho cru', '1 prato (50 g)', 50, 17, 0.9, 3.9, 0.1, 1.9, 4, 35, 0.2, 150, 18.2],
    ['Molho de tomate pronto', '2 colheres (40 g)', 40, 38, 1.4, 7.7, 0.2, 1.4, 418, 14, 0.8, 330, 7],
    ['Feijoada', '1 concha (150 g)', 150, 117, 8.7, 11.6, 6.5, 5.1, 507, 28, 1.3, 260, 0],
    ['Strogonoff de frango', '1 concha (130 g)', 130, 157, 13.8, 2.6, 10.0, 0.2, 340, 25, 0.6, 210, 0],
    ['Pizza de muçarela', '1 fatia (110 g)', 110, 270, 12.0, 30.0, 11.0, 2.0, 600, 190, 1.8, 170, 0],
    ['Coxinha de frango', '1 unidade (80 g)', 80, 283, 9.6, 34.5, 11.8, 1.5, 450, 20, 1.0, 120, 0],
    ['Café coado sem açúcar', '1 xícara (100 ml)', 100, 9, 0.7, 1.5, 0.1, 0, 1, 4, 0.1, 92, 0],
    ['Suco de laranja natural', '1 copo (200 ml)', 200, 33, 0.7, 7.6, 0.1, 0, 0, 8, 0.1, 160, 73],
    ['Água de coco', '1 copo (200 ml)', 200, 22, 0, 5.3, 0, 0.1, 2, 19, 0, 162, 2.4],
    ['Refrigerante cola', '1 lata (350 ml)', 350, 42, 0, 10.6, 0, 0, 4, 2, 0, 1, 0],
    ['Cerveja pilsen', '1 lata (350 ml)', 350, 41, 0.3, 3.3, 0, 0, 4, 5, 0, 27, 0],
    ['Açúcar refinado', '1 colher de chá (5 g)', 5, 387, 0.3, 99.5, 0, 0, 12, 4, 0.1, 6, 0],
    ['Mel', '1 colher de sopa (20 g)', 20, 309, 0, 84.0, 0, 0, 6, 10, 0.3, 99, 0.5],
    ['Chocolate ao leite', '1 quadradinho (25 g)', 25, 540, 7.2, 59.6, 30.3, 2.2, 70, 191, 1.6, 370, 0],
    ['Biscoito cream cracker', '5 unidades (30 g)', 30, 432, 10.1, 68.7, 14.4, 2.5, 854, 20, 2.2, 130, 0],
    ['Biscoito recheado de chocolate', '3 unidades (35 g)', 35, 472, 6.4, 70.5, 19.6, 3.0, 239, 27, 2.3, 180, 0],
    ['Barra de cereal', '1 unidade (25 g)', 25, 390, 5.4, 72.0, 9.0, 3.0, 140, 40, 1.5, 200, 0],
    ['Pipoca estourada sem óleo', '1 xícara (10 g)', 10, 387, 13.0, 78.0, 4.5, 14.5, 8, 7, 3.2, 329, 0],
    ['Sorvete de creme', '1 bola (60 g)', 60, 207, 3.5, 24.0, 11.0, 0.7, 80, 128, 0.1, 199, 0.6]
  ];

  var TIMERS = [
    ['Tabata clássico', 'tabata', 20, 10, 8, 1],
    ['HIIT 40/20', 'intervalado', 40, 20, 10, 1],
    ['EMOM 12 minutos', 'emom', 60, 0, 12, 1],
    ['Tiros de corrida 1/1:30', 'intervalado', 60, 90, 8, 1],
    ['Descanso de séries (90 s)', 'regressivo', 90, 0, 1, 1]
  ];

  var ROTINA_MODELOS = [
    ['Manhã produtiva', 'Começar o dia com corpo e cabeça no lugar', [
      { titulo: 'Beber 500 ml de água', categoria: 'saude', modo: 'habito', frequencia: 'diaria', hora_inicio: '06:30' },
      { titulo: 'Alongamento leve', categoria: 'saude', modo: 'bloco', frequencia: 'diaria', hora_inicio: '06:40', hora_fim: '06:55', duracao_min: 15 },
      { titulo: 'Planejar o dia', categoria: 'trabalho', modo: 'habito', frequencia: 'diaria', hora_inicio: '07:30' }]],
    ['Bloco de estudo', 'Sessões curtas e frequentes, de segunda a sexta', [
      { titulo: 'Estudo focado', categoria: 'estudo', modo: 'bloco', frequencia: 'semanal', dias_semana: '1,2,3,4,5', hora_inicio: '19:30', hora_fim: '21:00', duracao_min: 90 },
      { titulo: 'Revisão com flashcards', categoria: 'estudo', modo: 'habito', frequencia: 'diaria', hora_inicio: '21:00' }]],
    ['Semana de treino', 'Quatro treinos por semana com descanso ativo', [
      { titulo: 'Treino de musculação', categoria: 'treino', modo: 'bloco', frequencia: 'semanal', dias_semana: '1,2,4,5', hora_inicio: '18:00', hora_fim: '19:15', duracao_min: 75 },
      { titulo: 'Caminhada leve', categoria: 'treino', modo: 'habito', frequencia: 'semanal', dias_semana: '3,6', hora_inicio: '07:00' }]],
    ['Preparo de refeições', 'Domingo de marmitas para a semana', [
      { titulo: 'Lista de compras', categoria: 'alimentacao', modo: 'habito', frequencia: 'semanal', dias_semana: '6', hora_inicio: '10:00' },
      { titulo: 'Cozinhar marmitas', categoria: 'alimentacao', modo: 'bloco', frequencia: 'semanal', dias_semana: '0', hora_inicio: '15:00', hora_fim: '17:30', duracao_min: 150 }]],
    ['Fim de semana leve', 'Descanso com um pouco de ordem', [
      { titulo: 'Arrumar a casa', categoria: 'casa', modo: 'bloco', frequencia: 'semanal', dias_semana: '6', hora_inicio: '09:00', hora_fim: '10:30', duracao_min: 90 },
      { titulo: 'Tempo de hobby', categoria: 'hobby', modo: 'bloco', frequencia: 'semanal', dias_semana: '0', hora_inicio: '10:00', hora_fim: '12:00', duracao_min: 120 },
      { titulo: 'Revisar a semana', categoria: 'trabalho', modo: 'habito', frequencia: 'semanal', dias_semana: '0', hora_inicio: '20:00' }]]
  ];

  function categories_() {
    var rows = [];
    function add(list, tipo) {
      list.forEach(function (c, i) {
        var id = Utilities.getUuid();
        rows.push({ id: id, nome: c[0], tipo: tipo, cor: c[1], icone: c[2], ordem: i });
        c[3].forEach(function (s, j) { rows.push({ id: Utilities.getUuid(), nome: s, tipo: tipo, pai_id: id, cor: c[1], icone: c[2], ordem: j }); });
      });
    }
    add(CAT_DESPESA, 'despesa'); add(CAT_RECEITA, 'receita');
    return rows;
  }

  function foods_() {
    return ALIMENTOS.map(function (a) {
      var micro = {};
      if (a[9] !== null) micro.calcio_mg = a[9];
      if (a[10] !== null) micro.ferro_mg = a[10];
      if (a[11] !== null) micro.potassio_mg = a[11];
      if (a[12] !== null) micro.vitamina_c_mg = a[12];
      return { nome: a[0], porcao_desc: a[1], porcao_g: a[2], kcal: a[3], proteina_g: a[4], carbo_g: a[5], gordura_g: a[6], fibra_g: a[7], sodio_mg: a[8], fonte: 'TACO', nutrientes_json: micro };
    });
  }

  /** Insere dados de referência que ainda não existem para o usuário. */
  function reference() {
    var out = [];
    if (!Db.table('fin_categorias').count()) { Db.table('fin_categorias').insertMany(categories_(), { silent: true }); out.push('Categorias financeiras criadas'); }
    if (!Db.table('fit_exercicios').count()) {
      Db.table('fit_exercicios').insertMany(EXERCICIOS.map(function (e) {
        return { nome: e[0], grupo_muscular: e[1], equipamento: e[2], tipo: e[3], met: e[4], musculos_secundarios: e[5] || null, personalizado: false };
      }), { silent: true });
      out.push(EXERCICIOS.length + ' exercícios criados');
    }
    if (!Db.table('nut_alimentos').count({ fonte: 'TACO' })) { Db.table('nut_alimentos').insertMany(foods_(), { silent: true }); out.push(ALIMENTOS.length + ' alimentos (TACO aprox.) criados'); }
    if (!Db.table('fit_timers_presets').count()) {
      Db.table('fit_timers_presets').insertMany(TIMERS.map(function (t) { return { nome: t[0], tipo: t[1], trabalho_s: t[2], descanso_s: t[3], rounds: t[4], series: t[5] }; }), { silent: true });
      out.push('Presets de timer criados');
    }
    if (!Db.table('rot_modelos').count()) {
      Db.table('rot_modelos').insertMany(ROTINA_MODELOS.map(function (m) { return { nome: m[0], descricao: m[1], rotinas_json: m[2] }; }), { silent: true });
      out.push('Modelos de rotina criados');
    }
    if (!Db.table('fin_contas').count()) {
      Db.table('fin_contas').insert({ nome: 'Carteira', tipo: 'carteira', saldo_inicial: 0, cor: '#F6D365', icone: 'wallet', ordem: 0 }, { silent: true });
      out.push('Conta "Carteira" criada');
    }
    if (!out.length) out.push('Dados de referência já existiam');
    return out;
  }

  return { reference: reference, EXERCICIOS: EXERCICIOS, ALIMENTOS: ALIMENTOS };
})();
