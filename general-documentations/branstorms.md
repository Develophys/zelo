# Brainstorm

Backlog de ideias e ajustes do produto, agrupado por tipo.
Legenda de escopo: `[Global]` `[Médico]` `[Chat]` `[Autoavaliação]` `[Admin]` `[Gestor]`

---

## 1. Novas features

### 1.1 Engajamento e retenção

- **`[Médico]` Modal de confirmação ao abandonar o questionário**
  Quando o médico inicia o preenchimento do questionário mas volta para a Home, mostrar um modal
  pedindo que ele confirme que realmente quer sair. O intuito é engajar o médico a responder.
  - **IMPORTANTE!!!** pensar em como salvar essa informação nos relatórios, para que os gestores
    também consigam entender quantos médicos iniciaram um questionário mas não terminaram.
  - Devemos colocar nos termos de consentimento que as interações dentro do app serão salvas, para
    entender e auxiliar a gestão a identificar potenciais crises e tomar ações para preveni-las,
    visando a qualidade de vida do médico.

- **`[Chat]` Registrar mensagem digitada mas não enviada**
  Pensar em como salvar a informação de que o usuário começou a escrever algo no chat mas não
  enviou, para que os gestores consigam entender se usuários iniciam uma conversa e desistem.
  - Depende do mesmo alinhamento de termos de consentimento do item acima.

### 1.2 Acessibilidade e personalização

- **`[Global]` Customização de fontes e cores pelo usuário**
  O sistema precisa ser configurável a ponto de o usuário conseguir customizar as fontes e cores
  dentro da aplicação.
  - Inicialmente a aplicação foi criada visando a persona de um médico jovem, então isso não era
    um problema.
  - Precisamos expandir e tornar o aplicativo mais acessível para um range maior de usuários.
  - Para isso vamos criar uma persona de um médico com mais idade, na faixa dos 45 a 60 anos.
    Esse usuário pode precisar de fontes maiores e cores mais contrastantes.
  - Num primeiro momento, apenas cores e fontes customizáveis parecem suficientes. A navegação
    atual me parece suficiente.
  - Ver pendências abertas em **4. Pendências e decisões em aberto**.

- **`[Global]` Suporte a múltiplos idiomas (ES / EN / PT)**

- **`[Global]` Hotkeys**
  Adicionar atalhos de teclado globais e também por interação de tela.

### 1.3 Fluxos e funcionalidades

- **`[Médico]` Vincular uma instituição via leitor d]e QR Code**

- **`[Chat]` Opção de reiniciar a conversa com a IA**

- **`[Global]` Modal explicativo de criptografia na pill "anônimo"**
  Todo lugar que exibe a pill "anônimo" deve abrir um modal explicando a criptografia.

- **`[Admin]` Editar e excluir instituições**

- **`[Admin]` Tabela de "Instituições cadastradas" com busca**
  Transformar a listagem em tabela com input de busca.
  - Dados paginados no backend.
  - Tabela do frontend deve lidar com dados paginados.

- Tela do Gestor poderia ter ordem dos items de menu customizaveis?

### 1.4 Segurança e identidade

- **`[Global]` Autenticação anônima do médico**
  Pensar se existe uma forma de autenticar o usuário mantendo o anonimato — por exemplo usando o
  device hash (que já temos) somado a uma senha, ou validação por chave. A cada acesso, o médico
  anônimo passaria por login / senha / confirmação de chave enviada para o celular, para confirmar
  a identidade de forma anônima. "Confirmar identidade" aqui significa garantir que o médico está
  acessando o app por um dispositivo autorizado.

---

## 2. Ajustes no que já existe

### 2.1 `[Gestor]`

- **Filtro de "setor" por checkbox não está bom**
  Pensar em outras opções de componente, ou então melhorar o estilo dos checkboxes.
- **Filtro de setor não deveria refazer request**
  O frontend já requisita todos os dados de início, então não faz sentido que desmarcar um setor
  dispare uma nova requisição. O frontend deve tratar esse filtro localmente.
  - Adicionar url params quando o gestor alterar a seleção de setores, para que ao iniciar ou dar
    refresh na página com valores lá, esses valores sejam usados para pedir os dados já filtrados
    ao backend.
- **Altura do card "Tendência geral"**
  Deve ser igual à do "Sinais por setor" em telas grandes.
- **Paginar "Histórico de análises"**
  - Frontend deve exibir como tabela paginada com linhas colapsáveis.

### 2.2 `[Admin]`

- **"Sair" deve redirecionar para a Home**
- **Theme toggle na tela de login do admin e na página de admin**

### 2.3 `[Autoavaliação]`

- **Falta o theme toggle na página de Autoavaliação**

---

## 3. Bugs

- **`[Admin]` Máscara/validação de e-mail ausente**
  Hoje o campo aceita qualquer string. Precisa de máscara e validação de e-mail.

---

## 4. Pendências e decisões em aberto

- **`[Global]` Onde ficará o botão de customização de fontes/cores** nas páginas "Home" e "Você".
- **`[Global]` Validar a faixa etária da nova persona** (45–60 anos) — confirmar se faz sentido ou
  se precisamos ajustá-la.
- **`[Gestor]` Repensar a localização do botão de acesso à administração do sistema.**
  Não faz sentido ele estar na tela do gestor, já que o gestor não necessariamente vai acessar essa
  área, e o botão pode causar confusão.
- **`[Global]` Atualizar os termos de consentimento** para cobrir o salvamento de interações
  (questionário abandonado, rascunho de chat não enviado).

---

## 5. Concluído

- [x] **`[Chat]`** Transformar em conteúdo colapsável a seção com botão que redireciona para um chat
  real ou para as páginas de checking.

---

## Fast notes
- sair do manager deve redirecionar para pagina inicial do usuario comum
- Na tela Tendencias (visao manager) os items do grafico poderiam triggar um tooltip
que traz informacoes detalhadas daquele periodo