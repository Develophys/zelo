# Branstorm

- quando o medico inicia o preenchimento do questionário mas acaba voltando pra home, poderiamos
  mostrar algum modal que solicitasse que ele confirmasse que realemnte quer sair. O intuito é engajar o
  medico a responder.
  - IMPORTANTE!!! pensar em forma de salvar essa informacao nos relatorios, para que os gestores tambem
    possam entender quantos medicos iniciaram um questionario mas nao termina
  - devemos colocar nos termos de consentimento que iteracoes dentro do app serao salval para entender
    e auxiliar a gestao a identificar potenciais crises e tomar acoes para preveni-las, visando a
    qualidade de vida do médico

- o sistema precisa ser confirguravel a ponto de o usuario conseguir customizar as fontes e cores dentro
  da aplicação.
  - inicialmente a aplicação foi criada vizando uma persona de um médico jovem, entao esse nao era um porblema
  - precisamos expandir e tornar o aplicativo mais acessivel para um range maior de usuario
  - para isso vamos criar uma persona de um medico com mais idade, na faixa dos 45 à 60 anos (pensar se
    essa faixa etaria faz sentido, ou se precisamos ajusta-la). Esse usuario pode precisar de fontes maiores,
    cores mais contrastantes.
  - em um primeiro momento entendo que apenas cores e fontes customizaveis sao o bastante. A navegacao atual
    me parece suficiente.
  - PENDENCIA!!! definir local do botao na pagina 'Home' e 'Voce'
- users should be able to `Vincular uma instituicao` via qrcode reader
- CHAT_PAGE> make section with button to redirect to a real chat or checking pages a colapsable content.
- Thinking how we could save the information user start to write something with chat but not send, that way managers can't undertand if users start a conversation but not send.
- Add multi language support (ES/EN/PT)
- thinking if there is a way to authenticate a user but 'anonimamente', maybe using a device hash (like we already have) and a passaword, or a key validation, so every time user (anonimos doctors) will access the platafor they will needs some login, some passowrd, some key confirmation will be sent for then celphone to confirm identiy in a anonimos way. confirm identy means make sure the doctor are access the app via a authorizade device.
- add a option to restart AI chat conversation
- every place with 'anonimo' pill should open a modal explain criptografia
- Autoavaliação page nees theme togle
- add hotkeys globaly and for each site iteraction


ADMIN PAGE
- make email mask! today it accept any string!
- enable edit and delete institutions
- make 'intituicoes cadastradas' a table, with a search input
  - this data should be paginated in backend
  - frontend table should handle paginnated data
- Sair should redirect to home
- Add theme toggle in admin login page and in admin page

MANAGER PAGE
- check box as filters to 'setor' is not good
  - lets think in some options, or then improve checkbox styles
- frontend request first all data, so no make sense when user unselect some 'setor' it trigger a new requets to get data. frontend should hanlder this filter
  - add url params if user change some setor selection, so if manager user start/refresh page with some value there, so use it to request data filtere for backend
- 'Tendência geral' height should be same than 'Sinais por setor' in big screens
- make 'Histórico de análises' data paginneted
  - frontend should display it as a paginated 'coladpsed row' table content
- 